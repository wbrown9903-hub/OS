/**
 * Shopify Admin REST client for a **private/custom app access token**.
 *
 * Nexus does not run a public Shopify app, so there is no OAuth dance: the shop
 * owner creates a custom app in their admin, ticks the read scopes, and pastes
 * the `shpat_…` token into Nexus. That token is stored encrypted (SecretRecord)
 * and is only ever held in memory for the length of one request.
 *
 * Everything here is read-only. There is no code path in Nexus that writes to a
 * shop, which is a deliberate limit rather than an omission.
 */

import { HttpClient, parseLinkHeader, type FetchLike, type HttpLogEntry, type RateLimitReading } from "../core/http.js";
import { IntegrationError } from "../core/errors.js";
import {
  connected,
  connectionStateFromError,
  notConfigured,
  type ConnectionState,
} from "../core/connection.js";
import { type CommerceEventInput, type Fetched, type MetricSnapshotInput, toIso } from "../core/types.js";
import {
  commerceEventForOrder,
  fulfilmentQueueFromOrders,
  lowStockFromProducts,
  metricsForSales,
  shopStatusFrom,
  summariseSales,
} from "./mapping.js";
import type {
  FulfilmentQueueEntry,
  LowStockEntry,
  SalesSummary,
  ShopStatus,
  ShopifyOrder,
  ShopifyProduct,
  ShopifyShop,
} from "./types.js";

/** Pinned so a Shopify version bump is a deliberate, reviewed change. */
export const SHOPIFY_API_VERSION = "2024-10";

/** Read scopes Nexus asks the shop owner to tick when creating the custom app. */
export const SHOPIFY_REQUIRED_SCOPES = ["read_orders", "read_products", "read_inventory"] as const;

export interface ShopifyClientConfig {
  /** Connection row id, stamped onto every metric and event produced. */
  connectionId: string;
  /** `example.myshopify.com` — with or without scheme; normalised here. */
  shopDomain: string;
  /** The `shpat_…` custom app token. Held in memory only. */
  accessToken: string;
  apiVersion?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Safety valve on pagination so one bad window cannot loop forever. */
  maxPages?: number;
  /** Variants at or below this quantity are "low stock". */
  lowStockThreshold?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onLog?: (entry: HttpLogEntry) => void;
  onRateLimit?: (reading: RateLimitReading) => void;
}

export interface OrderQuery {
  /** Inclusive lower bound on `created_at`. */
  createdAtMin?: Date | string;
  /** Exclusive upper bound on `created_at`. */
  createdAtMax?: Date | string;
  /** "any" | "open" | "closed" | "cancelled". Defaults to "any". */
  status?: "any" | "open" | "closed" | "cancelled";
  financialStatus?: "any" | "paid" | "pending" | "refunded" | "partially_refunded" | "voided";
  fulfillmentStatus?: "any" | "shipped" | "partial" | "unshipped" | "unfulfilled";
  /** Page size, 1..250. */
  limit?: number;
  /** Stop after this many pages even if more remain. */
  maxPages?: number;
}

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page, or null when the list is complete. */
  nextPageInfo: string | null;
  fetchedAt: string;
}

/** Normalises `https://x.myshopify.com/` and `x.myshopify.com` to the bare host. */
export function normaliseShopDomain(input: string): string {
  const trimmed = input.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes(".")) return trimmed;
  return `${trimmed}.myshopify.com`;
}

export function isPlausibleShopDomain(domain: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) || /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain);
}

export class ShopifyClient {
  private readonly http: HttpClient;
  private readonly config: Required<Pick<ShopifyClientConfig, "connectionId" | "apiVersion" | "maxPages" | "lowStockThreshold">> & ShopifyClientConfig;
  private readonly shopDomain: string;
  private readonly nowMs: () => number;
  /** Populated by the first `shop.json` call so money maths has a currency. */
  private cachedCurrency = "";

  constructor(config: ShopifyClientConfig) {
    this.shopDomain = normaliseShopDomain(config.shopDomain);
    this.config = {
      ...config,
      apiVersion: config.apiVersion ?? SHOPIFY_API_VERSION,
      maxPages: config.maxPages ?? 20,
      lowStockThreshold: config.lowStockThreshold ?? 3,
    };
    this.nowMs = config.now ?? (() => Date.now());
    this.http = new HttpClient({
      service: "Shopify",
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
      ...(config.now ? { now: config.now } : {}),
      ...(config.sleep ? { sleep: config.sleep } : {}),
      ...(config.random ? { random: config.random } : {}),
      defaultTimeoutMs: config.timeoutMs ?? 15_000,
      defaultMaxAttempts: config.maxAttempts ?? 4,
      ...(config.onLog ? { onLog: config.onLog } : {}),
      ...(config.onRateLimit ? { onRateLimit: config.onRateLimit } : {}),
    });
  }

  /* ------------------------------------------------------------------ */
  /* Connection                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Distinguishes: nothing configured, wrong shop address, bad token, token
   * without the required scopes, shop unreachable, rate limited.
   */
  async testConnection(): Promise<ConnectionState> {
    const checkedAt = new Date(this.nowMs()).toISOString();
    if (!this.config.accessToken) {
      return notConfigured(
        "No Shopify access token has been saved yet.",
        "In Shopify go to Settings › Apps and sales channels › Develop apps, create an app with read access to orders and products, then paste its Admin API access token into Nexus.",
        checkedAt,
      );
    }
    if (!this.shopDomain || !isPlausibleShopDomain(this.shopDomain)) {
      return notConfigured(
        "The shop address does not look like a Shopify shop.",
        "Enter the address that ends in .myshopify.com — you can find it in your Shopify admin URL.",
        checkedAt,
      );
    }

    const startedAt = this.nowMs();
    try {
      const { data, response } = await this.http.json<{ shop?: ShopifyShop }>(this.url("shop.json"), {
        headers: this.headers(),
        maxAttempts: 2,
      });
      const shop = data.shop;
      if (!shop) {
        throw new IntegrationError("Shopify", "badResponse", "That address answered, but it is not a Shopify shop.", "Check the .myshopify.com address in Settings › Connections.");
      }
      this.cachedCurrency = (shop.currency ?? "").toUpperCase();
      const granted = readGrantedScopes(response.headers);
      const missing = SHOPIFY_REQUIRED_SCOPES.filter((scope) => granted.length > 0 && !granted.includes(scope));
      return connected(`${shop.name ?? this.shopDomain} (${this.cachedCurrency || "no currency"})`, {
        grantedScopes: granted,
        missingScopes: missing,
        latencyMs: response.durationMs,
        checkedAt,
        facts: {
          shopDomain: shop.myshopify_domain ?? this.shopDomain,
          plan: shop.plan_display_name ?? shop.plan_name ?? "unknown",
          timezone: shop.iana_timezone ?? shop.timezone ?? "",
          apiVersion: this.config.apiVersion,
        },
      });
    } catch (error) {
      if (error instanceof IntegrationError && error.code === "notFound") {
        return {
          kind: "wrongAddress",
          ok: false,
          message: "No Shopify shop answered at that address.",
          nextStep: "Check the shop address ends in .myshopify.com and has no typos.",
          checkedAt,
          latencyMs: this.nowMs() - startedAt,
        };
      }
      if (error instanceof IntegrationError && error.code === "invalidCredentials") {
        return {
          kind: "invalidCredentials",
          ok: false,
          message: "Shopify did not accept that access token.",
          nextStep: "Create a fresh Admin API access token in Shopify › Settings › Apps and sales channels › Develop apps, and paste it in again.",
          checkedAt,
        };
      }
      return connectionStateFromError(error, checkedAt);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Reads                                                               */
  /* ------------------------------------------------------------------ */

  async fetchShopStatus(): Promise<Fetched<ShopStatus>> {
    const { data, response } = await this.http.json<{ shop?: ShopifyShop }>(this.url("shop.json"), { headers: this.headers() });
    if (!data.shop) throw this.badShape("shop");
    this.cachedCurrency = (data.shop.currency ?? this.cachedCurrency).toUpperCase();
    return { data: shopStatusFrom(data.shop), fetchedAt: new Date(this.nowMs() - response.durationMs).toISOString(), fromCache: false };
  }

  /** One page of orders. Prefer `fetchOrders` unless you are paging by hand. */
  async fetchOrderPage(query: OrderQuery = {}, pageInfo?: string): Promise<Page<ShopifyOrder>> {
    // Shopify forbids sending filters alongside a page_info cursor.
    const params: Record<string, string | number | undefined> = pageInfo
      ? { limit: clampLimit(query.limit), page_info: pageInfo }
      : {
          limit: clampLimit(query.limit),
          status: query.status ?? "any",
          ...(query.financialStatus ? { financial_status: query.financialStatus } : {}),
          ...(query.fulfillmentStatus ? { fulfillment_status: query.fulfillmentStatus } : {}),
          ...(query.createdAtMin ? { created_at_min: toIso(query.createdAtMin) } : {}),
          ...(query.createdAtMax ? { created_at_max: toIso(query.createdAtMax) } : {}),
        };

    const { data, response } = await this.http.json<{ orders?: ShopifyOrder[] }>(this.url("orders.json"), {
      headers: this.headers(),
      query: params,
    });
    const orders = Array.isArray(data.orders) ? data.orders.filter(hasNumericId) : [];
    return {
      items: orders,
      nextPageInfo: extractPageInfo(response.headers.get("link")),
      fetchedAt: new Date(this.nowMs() - response.durationMs).toISOString(),
    };
  }

  /** Walks the cursor to the end (or `maxPages`) and returns every order. */
  async fetchOrders(query: OrderQuery = {}): Promise<Fetched<ShopifyOrder[]> & { truncated: boolean }> {
    const limitPages = Math.max(1, query.maxPages ?? this.config.maxPages);
    const collected: ShopifyOrder[] = [];
    let cursor: string | undefined;
    let truncated = false;
    let fetchedAt = new Date(this.nowMs()).toISOString();

    for (let page = 0; page < limitPages; page += 1) {
      const result: Page<ShopifyOrder> = await this.fetchOrderPage(query, cursor);
      collected.push(...result.items);
      fetchedAt = result.fetchedAt;
      if (!result.nextPageInfo) {
        cursor = undefined;
        break;
      }
      cursor = result.nextPageInfo;
      if (page === limitPages - 1) truncated = true;
    }

    return { data: collected, fetchedAt, fromCache: false, truncated };
  }

  /** Sales totals, order count, average order value and refunds for a window. */
  async fetchSalesSummary(window: { start: Date | string; end: Date | string }): Promise<SalesSummary> {
    const currency = await this.currency();
    const orders = await this.fetchOrders({ createdAtMin: window.start, createdAtMax: window.end, status: "any" });
    return summariseSales(orders.data, {
      currency,
      windowStart: window.start,
      windowEnd: window.end,
      fetchedAt: orders.fetchedAt,
      truncated: orders.truncated,
    });
  }

  /** The same window, already shaped as `MetricSnapshot` rows. */
  async fetchSalesMetrics(window: { start: Date | string; end: Date | string }): Promise<MetricSnapshotInput[]> {
    const summary = await this.fetchSalesSummary(window);
    return metricsForSales(this.config.connectionId, summary);
  }

  /** Recent orders as `CommerceEvent` rows, ready to be upserted. */
  async fetchCommerceEvents(window: { start: Date | string; end: Date | string }): Promise<Fetched<CommerceEventInput[]>> {
    const currency = await this.currency();
    const orders = await this.fetchOrders({ createdAtMin: window.start, createdAtMax: window.end, status: "any" });
    const events = orders.data.map((order) => {
      const kind = order.cancelled_at
        ? "order.cancelled"
        : (order.refunds?.length ?? 0) > 0
          ? "order.refunded"
          : order.financial_status === "paid"
            ? "order.paid"
            : "order.created";
      return commerceEventForOrder(this.config.connectionId, order, kind, currency);
    });
    return { data: events, fetchedAt: orders.fetchedAt, fromCache: false };
  }

  async fetchFulfilmentQueue(options: { limit?: number } = {}): Promise<Fetched<FulfilmentQueueEntry[]>> {
    const currency = await this.currency();
    const orders = await this.fetchOrders({
      status: "open",
      fulfillmentStatus: "unfulfilled",
      limit: options.limit ?? 50,
      maxPages: 4,
    });
    return {
      data: fulfilmentQueueFromOrders(orders.data, currency, new Date(this.nowMs())),
      fetchedAt: orders.fetchedAt,
      fromCache: false,
    };
  }

  async fetchLowStock(options: { threshold?: number; maxPages?: number } = {}): Promise<Fetched<LowStockEntry[]>> {
    const threshold = options.threshold ?? this.config.lowStockThreshold;
    const limitPages = Math.max(1, options.maxPages ?? 4);
    const products: ShopifyProduct[] = [];
    let cursor: string | undefined;
    let fetchedAt = new Date(this.nowMs()).toISOString();

    for (let page = 0; page < limitPages; page += 1) {
      const params: Record<string, string | number | undefined> = cursor
        ? { limit: 250, page_info: cursor }
        : { limit: 250, status: "active" };
      const { data, response } = await this.http.json<{ products?: ShopifyProduct[] }>(this.url("products.json"), {
        headers: this.headers(),
        query: params,
      });
      products.push(...(Array.isArray(data.products) ? data.products.filter(hasNumericId) : []));
      fetchedAt = new Date(this.nowMs() - response.durationMs).toISOString();
      const next = extractPageInfo(response.headers.get("link"));
      if (!next) break;
      cursor = next;
    }

    return { data: lowStockFromProducts(products, threshold), fetchedAt, fromCache: false };
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  /** The shop's currency, fetched once and remembered for the client's life. */
  private async currency(): Promise<string> {
    if (this.cachedCurrency) return this.cachedCurrency;
    const status = await this.fetchShopStatus();
    this.cachedCurrency = status.data.currency || "USD";
    return this.cachedCurrency;
  }

  private url(path: string): string {
    return `https://${this.shopDomain}/admin/api/${this.config.apiVersion}/${path}`;
  }

  private headers(): Record<string, string> {
    return {
      "x-shopify-access-token": this.config.accessToken,
      accept: "application/json",
      "user-agent": "NexusOS/0.1 (+https://nexus.os)",
    };
  }

  private badShape(what: string): IntegrationError {
    return new IntegrationError("Shopify", "badResponse", `Shopify's reply did not contain the ${what} information Nexus expected.`, "This usually clears up on its own. If it does not, reconnect the shop in Settings › Connections.");
  }
}

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return 250;
  return Math.min(250, Math.max(1, Math.floor(limit)));
}

function hasNumericId<T extends { id?: unknown }>(value: T): value is T & { id: number } {
  return typeof value.id === "number" && Number.isFinite(value.id);
}

/** Shopify's cursor lives in the `page_info` query parameter of the `next` link. */
export function extractPageInfo(linkHeader: string | null): string | null {
  const { next } = parseLinkHeader(linkHeader);
  if (!next) return null;
  try {
    return new URL(next).searchParams.get("page_info");
  } catch {
    const match = /[?&]page_info=([^&>]+)/.exec(next);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}

/** Shopify reports the token's scopes on every Admin API response. */
export function readGrantedScopes(headers: Headers): string[] {
  const raw = headers.get("x-shopify-api-access-scopes") ?? headers.get("x-shopify-access-scopes");
  if (!raw) return [];
  return raw
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}
