/**
 * The one HTTP path every integration uses.
 *
 * It owns: URL policy, request timeouts, retry with exponential backoff and
 * jitter, 429/`Retry-After` handling, leaky-bucket throttling (Shopify), and
 * redacted logging. Clocks, sleeping, randomness and `fetch` itself are all
 * injected so tests are deterministic and never touch the network.
 */

import { IntegrationError, errorForStatus } from "./errors.js";
import {
  redactSecrets,
  safeJson,
  validateLocalServiceUrl,
  validateOutboundUrl,
  type UrlCheck,
} from "../security-port.js";

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  /** The response body as text. Callers parse; nothing here assumes JSON. */
  body: string;
  url: string;
  /** Milliseconds spent on the wire, for diagnostics. */
  durationMs: number;
  /** How many attempts it took, including the successful one. */
  attempts: number;
  /** True when the server replied 304 and the caller should use its cache. */
  notModified: boolean;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Hard ceiling for one attempt. The retry budget is separate. */
  timeoutMs?: number;
  /** Total attempts, including the first. */
  maxAttempts?: number;
  /** Statuses that are worth another attempt. Defaults to 408/429/5xx. */
  retryStatuses?: number[];
  /** Extra query parameters, appended safely. */
  query?: Record<string, string | number | undefined>;
  /** Signal from the caller (workflow cancelled, request aborted). */
  signal?: AbortSignal;
  /** 200-499 statuses the caller wants back instead of thrown. */
  expectStatuses?: number[];
  /** Skip https-only enforcement — only for user-declared local services. */
  allowLocalService?: boolean;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpLogEntry {
  at: string;
  service: string;
  method: string;
  /** Origin + path only. Query strings can carry tokens, so they are dropped. */
  target: string;
  status: number | null;
  attempts: number;
  durationMs: number;
  outcome: "ok" | "retry" | "failed";
  note?: string;
}

export interface HttpClientOptions {
  service: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Base delay for exponential backoff. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  defaultTimeoutMs?: number;
  defaultMaxAttempts?: number;
  onLog?: (entry: HttpLogEntry) => void;
  /** Called with the bucket usage ratio (0..1) after every response that reports one. */
  onRateLimit?: (usage: RateLimitReading) => void;
}

export interface RateLimitReading {
  /** Requests used out of the bucket, when the service reports one. */
  used?: number;
  limit?: number;
  /** 0..1. 1 means the bucket is full and the next call will be throttled. */
  usage: number;
  /** Seconds the service explicitly asked us to wait. */
  retryAfterSeconds?: number;
}

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

export class HttpClient {
  private readonly service: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxAttempts: number;
  private readonly onLog: ((entry: HttpLogEntry) => void) | undefined;
  private readonly onRateLimit: ((usage: RateLimitReading) => void) | undefined;

  /** Set when a response told us to hold off; the next request waits it out. */
  private throttleUntil = 0;

  constructor(options: HttpClientOptions) {
    this.service = options.service;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
    this.backoffBaseMs = options.backoffBaseMs ?? 500;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.onLog = options.onLog;
    this.onRateLimit = options.onRateLimit;
  }

  /** Exposed so callers can show "waiting for the shop's rate limit to clear". */
  get throttledForMs(): number {
    return Math.max(0, this.throttleUntil - this.now());
  }

  async request(rawUrl: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const check: UrlCheck = options.allowLocalService ? validateLocalServiceUrl(rawUrl) : validateOutboundUrl(rawUrl);
    if (!check.ok) {
      throw new IntegrationError(this.service, "blockedByPolicy", check.message, check.nextStep, {
        detail: `url policy: ${check.code}`,
      });
    }
    const url = check.url;
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }

    const method = (options.method ?? "GET").toUpperCase();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxAttempts = Math.max(1, options.maxAttempts ?? this.defaultMaxAttempts);
    const retryStatuses = new Set(options.retryStatuses ?? DEFAULT_RETRY_STATUSES);
    const expect = new Set(options.expectStatuses ?? []);
    const target = `${url.origin}${url.pathname}`;

    let lastError: IntegrationError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.waitForThrottle();
      const started = this.now();
      let response: Response;
      try {
        response = await this.performOnce(url.toString(), method, options, timeoutMs);
      } catch (error) {
        lastError = this.networkError(error, timeoutMs);
        this.log({ method, target, status: null, attempts: attempt, durationMs: this.now() - started, outcome: attempt < maxAttempts ? "retry" : "failed", note: lastError.code });
        if (attempt < maxAttempts && lastError.retryable) {
          await this.backoff(attempt);
          continue;
        }
        throw lastError;
      }

      const durationMs = this.now() - started;
      const reading = readRateLimit(response.headers);
      if (reading) {
        this.onRateLimit?.(reading);
        // Pre-emptively slow down before the shop starts refusing us.
        if (reading.usage >= 0.9) this.throttleUntil = Math.max(this.throttleUntil, this.now() + 1000);
      }

      if (response.status === 304) {
        this.log({ method, target, status: 304, attempts: attempt, durationMs, outcome: "ok", note: "not modified" });
        return { status: 304, ok: true, headers: response.headers, body: "", url: url.toString(), durationMs, attempts: attempt, notModified: true };
      }

      if (response.ok || expect.has(response.status)) {
        const body = await safeText(response);
        this.log({ method, target, status: response.status, attempts: attempt, durationMs, outcome: "ok" });
        return { status: response.status, ok: response.ok, headers: response.headers, body, url: url.toString(), durationMs, attempts: attempt, notModified: false };
      }

      const retryAfter = readRetryAfterSeconds(response.headers);
      const detail = redactSecrets((await safeText(response)).slice(0, 400));
      lastError = errorForStatus(this.service, response.status, {
        status: response.status,
        ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
        detail,
      });

      const shouldRetry = attempt < maxAttempts && retryStatuses.has(response.status);
      this.log({ method, target, status: response.status, attempts: attempt, durationMs, outcome: shouldRetry ? "retry" : "failed", note: lastError.code });
      if (!shouldRetry) throw lastError;

      if (response.status === 429 && retryAfter !== undefined) {
        this.throttleUntil = Math.max(this.throttleUntil, this.now() + retryAfter * 1000);
        await this.waitForThrottle();
      } else {
        await this.backoff(attempt);
      }
    }

    throw lastError ?? new IntegrationError(this.service, "unknown", "The request could not be completed.", "Try again in a moment.");
  }

  /** JSON convenience that turns a parse failure into a `badResponse` error. */
  async json<T>(rawUrl: string, options: HttpRequestOptions = {}): Promise<{ data: T; response: HttpResponse }> {
    const response = await this.request(rawUrl, {
      ...options,
      headers: { accept: "application/json", ...(options.headers ?? {}) },
    });
    if (response.notModified) {
      throw new IntegrationError(this.service, "badResponse", "The service said nothing had changed, but no cached copy was available.", "Refresh again to fetch a full copy.");
    }
    try {
      return { data: JSON.parse(response.body) as T, response };
    } catch {
      throw new IntegrationError(this.service, "badResponse", "The service replied with something that was not valid data.", "This usually means the address points at a different service. Check it in Settings › Connections.", {
        status: response.status,
        detail: redactSecrets(response.body.slice(0, 200)),
      });
    }
  }

  private async performOnce(url: string, method: string, options: HttpRequestOptions, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
    const onOuterAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onOuterAbort, { once: true });
    try {
      if (options.signal?.aborted) controller.abort(options.signal.reason);
      return await this.fetchImpl(url, {
        method,
        headers: options.headers ?? {},
        ...(options.body === undefined ? {} : { body: options.body }),
        signal: controller.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onOuterAbort);
    }
  }

  private networkError(error: unknown, timeoutMs: number): IntegrationError {
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message : String(error);
    if (name === "TimeoutError" || /timed? ?out/i.test(message)) {
      return new IntegrationError(this.service, "timeout", `The service did not reply within ${Math.round(timeoutMs / 1000)} seconds.`, "Check your internet connection and try again.", { cause: error, retryable: true });
    }
    if (name === "AbortError") {
      return new IntegrationError(this.service, "timeout", "The request was cancelled before it finished.", "Try again when you are ready.", { cause: error, retryable: false });
    }
    return new IntegrationError(this.service, "unreachable", "Nexus could not reach the service.", "Check your internet connection, then try again.", { cause: error, detail: redactSecrets(message), retryable: true });
  }

  /** Full jitter exponential backoff: wait ∈ [0, min(max, base·2^n)). */
  private async backoff(attempt: number): Promise<void> {
    const ceiling = Math.min(this.backoffMaxMs, this.backoffBaseMs * 2 ** (attempt - 1));
    await this.sleep(Math.round(ceiling * this.random()));
  }

  private async waitForThrottle(): Promise<void> {
    const remaining = this.throttleUntil - this.now();
    if (remaining > 0) await this.sleep(remaining);
  }

  private log(entry: Omit<HttpLogEntry, "at" | "service">): void {
    this.onLog?.({ at: new Date(this.now()).toISOString(), service: this.service, ...entry, ...(entry.note ? { note: redactSecrets(entry.note) } : {}) });
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * Reads whichever rate-limit dialect the service speaks. Shopify uses a
 * leaky-bucket header (`39/40`); most others use `X-RateLimit-Remaining`.
 */
export function readRateLimit(headers: Headers): RateLimitReading | null {
  const bucket = headers.get("x-shopify-shop-api-call-limit") ?? headers.get("x-shopify-api-call-limit");
  if (bucket && bucket.includes("/")) {
    const [usedRaw, limitRaw] = bucket.split("/");
    const used = Number(usedRaw);
    const limit = Number(limitRaw);
    if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) {
      return { used, limit, usage: Math.min(1, used / limit) };
    }
  }
  const remaining = Number(headers.get("x-ratelimit-remaining") ?? headers.get("ratelimit-remaining"));
  const limit = Number(headers.get("x-ratelimit-limit") ?? headers.get("ratelimit-limit"));
  if (Number.isFinite(remaining) && Number.isFinite(limit) && limit > 0) {
    return { used: limit - remaining, limit, usage: Math.min(1, (limit - remaining) / limit) };
  }
  const retryAfter = readRetryAfterSeconds(headers);
  if (retryAfter !== undefined) return { usage: 1, retryAfterSeconds: retryAfter };
  return null;
}

export function readRetryAfterSeconds(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 300);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, Math.min(300, Math.round((date - Date.now()) / 1000)));
  return undefined;
}

/**
 * Parses an RFC 5988 `Link` header, which is how Shopify paginates. Returns the
 * `next` and `previous` URLs when present.
 */
export function parseLinkHeader(value: string | null): { next?: string; previous?: string } {
  if (!value) return {};
  const result: { next?: string; previous?: string } = {};
  for (const part of value.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel\s*=\s*"?([a-z]+)"?/i.exec(part.trim());
    if (!match) continue;
    const [, href, rel] = match;
    if (!href || !rel) continue;
    if (rel.toLowerCase() === "next") result.next = href;
    if (rel.toLowerCase() === "previous" || rel.toLowerCase() === "prev") result.previous = href;
  }
  return result;
}

/** Debug helper used by the diagnostics screen. Never prints a body. */
export function describeRequestForLog(service: string, method: string, url: string, meta: Record<string, unknown> = {}): string {
  let target = url;
  try {
    const parsed = new URL(url);
    target = `${parsed.origin}${parsed.pathname}`;
  } catch {
    target = "[unparsable url]";
  }
  return `${service} ${method} ${target} ${safeJson(meta)}`;
}
