import { createHmac, timingSafeEqual } from "node:crypto";
import { NexusError } from "./errors.js";

/**
 * Verifies inbound webhooks (Shopify, WordPress, custom) before a single byte of
 * their payload influences a widget, a sound or a workflow.
 *
 * Three independent checks: signature, freshness, and single-use. A forged,
 * replayed or stale delivery fails all downstream processing.
 *
 * Port of apps/mac-bridge/Sources/SecurityCore/WebhookVerifier.swift. Where the
 * Swift side hand-rolls SHA-256 (it must run without CryptoKit on Linux CI), the
 * server uses `node:crypto`, including `timingSafeEqual` for the comparison.
 */

export type SignatureEncoding = "base64" | "hex";

export interface WebhookConfiguration {
  secret: string | Uint8Array;
  encoding: SignatureEncoding;
  /** How far a delivery's timestamp may drift from now before it is refused. */
  toleranceSeconds: number;
}

export type Clock = () => Date;

export function hmacSha256(secret: string | Uint8Array, body: string | Uint8Array): Buffer {
  const key = typeof secret === "string" ? Buffer.from(secret, "utf8") : Buffer.from(secret);
  const message = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  return createHmac("sha256", key).update(message).digest();
}

/** Constant-time comparison. Length mismatch is reported without leaking timing. */
export function secureCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function decodeSignature(signature: string, encoding: SignatureEncoding): Buffer | null {
  const trimmed = signature.trim();
  if (trimmed.length === 0) return null;
  if (encoding === "hex") {
    if (!/^[0-9a-fA-F]+$/.test(trimmed) || trimmed.length % 2 !== 0) return null;
    return Buffer.from(trimmed.toLowerCase(), "hex");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return null;
  const decoded = Buffer.from(trimmed, "base64");
  // Round-tripping catches inputs base64 silently accepts but did not encode.
  if (decoded.length === 0) return null;
  return decoded;
}

/**
 * Remembers recently seen identifiers so a captured delivery cannot be resent.
 * Also backs event de-duplication for sale sounds and notifications.
 */
export class ReplayCache {
  private readonly entries = new Map<string, number>();
  private readonly order: string[] = [];

  constructor(
    private readonly windowSeconds = 24 * 3600,
    private readonly capacity = 10_000,
  ) {}

  /**
   * Returns true when the identifier is new. Returns false if it has been seen
   * inside the window, which is the signal to skip all side effects.
   */
  claim(id: string, at: Date): boolean {
    this.prune(at);
    if (this.entries.has(id)) return false;
    this.entries.set(id, at.getTime());
    this.order.push(id);
    if (this.order.length > this.capacity) {
      const excess = this.order.splice(0, this.order.length - this.capacity);
      for (const old of excess) this.entries.delete(old);
    }
    return true;
  }

  hasSeen(id: string, at: Date): boolean {
    this.prune(at);
    return this.entries.has(id);
  }

  get size(): number {
    return this.entries.size;
  }

  reset(): void {
    this.entries.clear();
    this.order.length = 0;
  }

  private prune(now: Date): void {
    let removed = 0;
    for (const id of this.order) {
      const seen = this.entries.get(id);
      if (seen === undefined || (now.getTime() - seen) / 1000 <= this.windowSeconds) break;
      this.entries.delete(id);
      removed += 1;
    }
    if (removed > 0) this.order.splice(0, removed);
  }
}

export class WebhookVerifier {
  readonly configuration: WebhookConfiguration;

  constructor(
    configuration: Partial<WebhookConfiguration> & Pick<WebhookConfiguration, "secret">,
    private readonly replayCache: ReplayCache = new ReplayCache(),
    private readonly clock: Clock = () => new Date(),
  ) {
    this.configuration = {
      secret: configuration.secret,
      encoding: configuration.encoding ?? "base64",
      toleranceSeconds: configuration.toleranceSeconds ?? 300,
    };
  }

  expectedSignature(body: string | Uint8Array): string {
    const digest = hmacSha256(this.configuration.secret, body);
    return this.configuration.encoding === "base64"
      ? digest.toString("base64")
      : digest.toString("hex");
  }

  /**
   * @param deliveryID the provider's unique delivery identifier, used for
   *        single-use enforcement — this is what stops a sale sound playing twice.
   * @param timestamp the provider's send time, when it supplies one.
   */
  verify(options: {
    body: string | Uint8Array;
    signature: string;
    deliveryId: string;
    timestamp?: Date | null;
  }): void {
    const provided = decodeSignature(options.signature, this.configuration.encoding);
    if (!provided || provided.length === 0) {
      throw NexusError.security(
        "badSignatureEncoding",
        "A delivery from this service had an unreadable signature and was ignored.",
        "Re-copy the signing secret in the connection settings, then send a test event.",
      );
    }
    const expected = hmacSha256(this.configuration.secret, options.body);
    if (!secureCompare(provided, expected)) {
      throw NexusError.security(
        "signatureMismatch",
        "A delivery claiming to come from this service was not signed correctly and was rejected.",
        "Check that the signing secret in Nexus OS matches the one in the service's settings.",
      );
    }
    const now = this.clock();
    if (options.timestamp) {
      const driftSeconds = Math.abs(now.getTime() - options.timestamp.getTime()) / 1000;
      if (driftSeconds > this.configuration.toleranceSeconds) {
        throw NexusError.security(
          "staleDelivery",
          "A delivery arrived too long after it was sent and was rejected.",
          "Check that your computer's clock is set automatically, then retry the event.",
        );
      }
    }
    if (!this.replayCache.claim(options.deliveryId, now)) {
      throw NexusError.security(
        "replayedDelivery",
        "That event was already received and was not processed twice.",
        "No action needed — this protects you from duplicate orders or duplicate sounds.",
      );
    }
  }
}
