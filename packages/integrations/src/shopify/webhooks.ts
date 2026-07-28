/**
 * Inbound Shopify webhook processing.
 *
 * The order of operations is fixed and must not be rearranged:
 *
 *   1. verify the HMAC-SHA256 (base64) over the **raw** body
 *   2. reject anything unsigned, mis-signed, or older than the freshness window
 *   3. de-duplicate — by delivery id *and* independently by order id
 *   4. only then emit a typed event that may cause a side effect
 *
 * Steps 3 and 4 are what stop a sale sound playing twice. Shopify retries a
 * delivery up to 19 times over 48 hours, and a shop can also fire
 * `orders/create` and `orders/paid` for the same order; the delivery-id check
 * catches the first case and the order-id check catches the second.
 */

import { redactObject, verifyHmacSha256Base64 } from "../security-port.js";
import { toIso, toMinorUnits } from "../core/types.js";
import { kindForTopic, orderCurrency, orderDisplayName, orderOccurredAt, orderTotalMinor } from "./mapping.js";
import type { ShopifyOrder, ShopifyWebhookEvent } from "./types.js";

/** Header names Shopify sends. Lower-cased because Node normalises them. */
export const SHOPIFY_HEADERS = {
  hmac: "x-shopify-hmac-sha256",
  topic: "x-shopify-topic",
  domain: "x-shopify-shop-domain",
  deliveryId: "x-shopify-webhook-id",
  triggeredAt: "x-shopify-triggered-at",
  apiVersion: "x-shopify-api-version",
  testFlag: "x-shopify-test",
} as const;

export type WebhookRejectionReason =
  | "missingSignature"
  | "badSignature"
  | "missingTopic"
  | "wrongShop"
  | "stale"
  | "malformedBody"
  | "duplicateDelivery"
  | "duplicateSubject"
  | "unsupportedTopic";

export type WebhookOutcome =
  | { accepted: true; event: ShopifyWebhookEvent; record: DeliveryRecord }
  | { accepted: false; reason: WebhookRejectionReason; message: string; /** HTTP status to reply with. */ status: number };

/** What is written to `WebhookDelivery` before any side effect happens. */
export interface DeliveryRecord {
  connectionId: string;
  source: string;
  topic: string;
  /** Shopify's delivery id — the unique key on `WebhookDelivery`. */
  externalId: string;
  signatureOK: boolean;
  processedAt: string;
  /** SHA-256 of the raw body, so a replay with a different body is visible. */
  payloadHash: string;
}

/**
 * The de-duplication store. Backed by `WebhookDelivery`'s unique index in
 * production and by a Map in tests. `claim` must be atomic: it returns false if
 * the key was already present, which is how a concurrent double delivery loses.
 */
export interface DeduplicationStore {
  /** Atomically reserve a key. Returns false when it was already taken. */
  claim(key: string): Promise<boolean>;
  /** Release a key after a failure, so a retry can legitimately re-run. */
  release(key: string): Promise<void>;
}

export class MemoryDeduplicationStore implements DeduplicationStore {
  private readonly claimed = new Set<string>();

  async claim(key: string): Promise<boolean> {
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }

  async release(key: string): Promise<void> {
    this.claimed.delete(key);
  }

  has(key: string): boolean {
    return this.claimed.has(key);
  }

  get size(): number {
    return this.claimed.size;
  }
}

export interface ShopifyWebhookProcessorOptions {
  connectionId: string;
  /** The shared secret shown when the webhook was created in the Shopify admin. */
  webhookSecret: string;
  /** Reject deliveries whose `X-Shopify-Triggered-At` is older than this. */
  maxAgeSeconds?: number;
  /** Reject deliveries claiming to come from a different shop. */
  expectedShopDomain?: string;
  store: DeduplicationStore;
  now?: () => number;
  /** Topics Nexus acts on. Anything else is acknowledged but ignored. */
  supportedTopics?: string[];
}

const DEFAULT_SUPPORTED_TOPICS = [
  "orders/create",
  "orders/paid",
  "orders/updated",
  "orders/cancelled",
  "orders/fulfilled",
  "orders/partially_fulfilled",
  "refunds/create",
  "inventory_levels/update",
  "products/update",
  "shop/update",
  "app/uninstalled",
];

export class ShopifyWebhookProcessor {
  private readonly options: Required<Omit<ShopifyWebhookProcessorOptions, "expectedShopDomain" | "now">> &
    Pick<ShopifyWebhookProcessorOptions, "expectedShopDomain">;
  private readonly now: () => number;

  constructor(options: ShopifyWebhookProcessorOptions) {
    this.options = {
      connectionId: options.connectionId,
      webhookSecret: options.webhookSecret,
      maxAgeSeconds: options.maxAgeSeconds ?? 300,
      store: options.store,
      supportedTopics: options.supportedTopics ?? DEFAULT_SUPPORTED_TOPICS,
      ...(options.expectedShopDomain ? { expectedShopDomain: options.expectedShopDomain } : {}),
    };
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * @param rawBody the body exactly as received. Re-serialising JSON before
   *        this point breaks the signature, which is why the route must keep
   *        the raw bytes.
   */
  async process(rawBody: string, headers: HeaderBag): Promise<WebhookOutcome> {
    const read = (name: string) => readHeader(headers, name);

    const signature = read(SHOPIFY_HEADERS.hmac);
    if (!signature) {
      return reject("missingSignature", "The delivery had no signature, so it was ignored.", 401);
    }
    if (!verifyHmacSha256Base64(this.options.webhookSecret, rawBody, signature)) {
      return reject("badSignature", "The delivery's signature did not match this shop's secret, so it was ignored.", 401);
    }

    const topic = read(SHOPIFY_HEADERS.topic);
    if (!topic) {
      return reject("missingTopic", "The delivery did not say what it was about, so it was ignored.", 400);
    }

    const shopDomain = read(SHOPIFY_HEADERS.domain);
    if (this.options.expectedShopDomain && shopDomain && shopDomain.toLowerCase() !== this.options.expectedShopDomain.toLowerCase()) {
      return reject("wrongShop", "The delivery came from a different shop than this connection, so it was ignored.", 401);
    }

    const triggeredAt = read(SHOPIFY_HEADERS.triggeredAt);
    if (triggeredAt) {
      const ageSeconds = (this.now() - Date.parse(triggeredAt)) / 1000;
      if (!Number.isFinite(ageSeconds)) {
        return reject("stale", "The delivery's timestamp could not be read, so it was ignored.", 400);
      }
      // A future timestamp is as suspicious as an ancient one; allow a minute of clock skew.
      if (ageSeconds > this.options.maxAgeSeconds || ageSeconds < -60) {
        return reject("stale", `The delivery was ${Math.round(ageSeconds)}s old, past the ${this.options.maxAgeSeconds}s freshness window, so it was ignored.`, 202);
      }
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return reject("malformedBody", "The delivery's contents were not readable, so it was ignored.", 400);
    }

    const record: DeliveryRecord = {
      connectionId: this.options.connectionId,
      source: "shopify",
      topic,
      externalId: read(SHOPIFY_HEADERS.deliveryId) || `synthetic:${await sha256Hex(rawBody)}`,
      signatureOK: true,
      processedAt: new Date(this.now()).toISOString(),
      payloadHash: await sha256Hex(rawBody),
    };

    if (!this.options.supportedTopics.includes(topic)) {
      return reject("unsupportedTopic", `Nexus does not act on “${topic}”, so the delivery was acknowledged and discarded.`, 200);
    }

    // (3a) One delivery, once — this is the retry defence.
    const deliveryKey = `shopify:delivery:${record.externalId}`;
    if (!(await this.options.store.claim(deliveryKey))) {
      return reject("duplicateDelivery", "This exact delivery was already processed, so nothing happened a second time.", 200);
    }

    const event = this.buildEvent(topic, record, payload, read(SHOPIFY_HEADERS.testFlag) === "true");

    // (3b) One subject, one outcome — this is the "sale sound plays twice" defence.
    // orders/create and orders/paid are different deliveries about the same order.
    const subjectKey = `shopify:subject:${effectClassFor(event.kind)}:${event.subjectId}`;
    if (!(await this.options.store.claim(subjectKey))) {
      return reject("duplicateSubject", `Order ${event.subjectId} has already been counted, so it was not counted again.`, 200);
    }

    return { accepted: true, event, record };
  }

  /** Called when a downstream handler fails, so Shopify's retry can re-run it. */
  async releaseFor(event: ShopifyWebhookEvent, record: DeliveryRecord): Promise<void> {
    await this.options.store.release(`shopify:delivery:${record.externalId}`);
    await this.options.store.release(`shopify:subject:${effectClassFor(event.kind)}:${event.subjectId}`);
  }

  private buildEvent(topic: string, record: DeliveryRecord, payload: unknown, isTest: boolean): ShopifyWebhookEvent {
    const kind = kindForTopic(topic);
    const object = (payload ?? {}) as Record<string, unknown>;

    if (topic.startsWith("orders/")) {
      const order = object as unknown as ShopifyOrder;
      const currency = orderCurrency(order, "");
      return {
        source: "shopify",
        topic,
        deliveryId: record.externalId,
        subjectId: String(order.id ?? ""),
        kind,
        occurredAt: orderOccurredAt(order),
        currency,
        amountMinor: orderTotalMinor(order, currency),
        summary: `${orderDisplayName(order)} — ${describeOrder(kind)}`,
        isTest: isTest || order.test === true,
        payload: redactObject(payload),
      };
    }

    if (topic === "refunds/create") {
      const refund = object as { id?: number; order_id?: number; created_at?: string; transactions?: Array<{ amount?: string; currency?: string }> };
      const currency = (refund.transactions?.[0]?.currency ?? "").toUpperCase();
      const amount = (refund.transactions ?? []).reduce((sum, transaction) => sum + toMinorUnits(transaction.amount, currency), 0);
      return {
        source: "shopify",
        topic,
        deliveryId: record.externalId,
        subjectId: String(refund.id ?? refund.order_id ?? ""),
        kind,
        occurredAt: toIso(refund.created_at ?? new Date(this.now())),
        currency,
        amountMinor: amount,
        summary: `Refund on order ${refund.order_id ?? "unknown"}`,
        isTest,
        payload: redactObject(payload),
      };
    }

    const id = typeof object.id === "number" || typeof object.id === "string" ? String(object.id) : record.externalId;
    return {
      source: "shopify",
      topic,
      deliveryId: record.externalId,
      subjectId: id,
      kind,
      occurredAt: new Date(this.now()).toISOString(),
      currency: "",
      amountMinor: 0,
      summary: `${topic} for ${id}`,
      isTest,
      payload: redactObject(payload),
    };
  }
}

/**
 * Groups kinds that must not fire twice for the same object.
 *
 * `orders/create` and `orders/paid` both mean "a sale happened", so they share
 * the `sale` class and only the first one through plays the sound. A refund is
 * a different class, so a refund on an order that already sold is not swallowed.
 */
export function effectClassFor(kind: string): string {
  switch (kind) {
    case "order.created":
    case "order.paid":
      return "sale";
    case "order.refunded":
      return "refund";
    case "order.cancelled":
      return "cancellation";
    case "order.fulfilled":
    case "order.partiallyFulfilled":
      return "fulfilment";
    default:
      return kind;
  }
}

function describeOrder(kind: string): string {
  switch (kind) {
    case "order.paid":
      return "paid";
    case "order.created":
      return "new order";
    case "order.cancelled":
      return "cancelled";
    case "order.refunded":
      return "refunded";
    case "order.fulfilled":
      return "fulfilled";
    default:
      return kind;
  }
}

/** Headers as a plain object, a `Headers`, or Node's `IncomingHttpHeaders`. */
export type HeaderBag = Headers | Record<string, string | string[] | undefined>;

export function readHeader(headers: HeaderBag, name: string): string {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? "";
  }
  const bag = headers as Record<string, string | string[] | undefined>;
  const direct = bag[name] ?? bag[name.toLowerCase()] ?? bag[name.toUpperCase()];
  if (Array.isArray(direct)) return direct[0] ?? "";
  if (typeof direct === "string") return direct;
  // Case-insensitive fallback for bags built by hand.
  const found = Object.entries(bag).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = found?.[1];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function reject(reason: WebhookRejectionReason, message: string, status: number): WebhookOutcome {
  return { accepted: false, reason, message, status };
}

async function sha256Hex(value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}
