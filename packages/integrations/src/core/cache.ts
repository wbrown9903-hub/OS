/**
 * A tiny HTTP-aware cache.
 *
 * It exists so the RuneScape news feed (and anything else polled on a timer)
 * honours `ETag`, `Last-Modified`, `Cache-Control: max-age` and `Expires`
 * instead of hammering a public service. It is deliberately a plain interface
 * plus an in-memory implementation: a service can back it with the database or
 * the filesystem without this package knowing.
 */

export interface CacheEntry<T> {
  value: T;
  storedAt: string;
  /** Undefined means "no expiry was advertised"; the caller decides. */
  expiresAt?: string;
  etag?: string;
  lastModified?: string;
  /** Where it came from, kept for attribution and re-fetching. */
  sourceUrl?: string;
  attribution?: string;
}

export interface CacheStore<T> {
  get(key: string): Promise<CacheEntry<T> | null>;
  set(key: string, entry: CacheEntry<T>): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryCacheStore<T> implements CacheStore<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  async get(key: string): Promise<CacheEntry<T> | null> {
    return this.entries.get(key) ?? null;
  }

  async set(key: string, entry: CacheEntry<T>): Promise<void> {
    this.entries.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /** Test/diagnostic helper. */
  get size(): number {
    return this.entries.size;
  }
}

export interface CacheDirectives {
  etag?: string;
  lastModified?: string;
  expiresAt?: string;
  /** True when the service forbade storing the response at all. */
  noStore: boolean;
}

export function readCacheDirectives(headers: Headers, now: Date = new Date()): CacheDirectives {
  const control = (headers.get("cache-control") ?? "").toLowerCase();
  const noStore = control.includes("no-store") || control.includes("private");
  const directives: CacheDirectives = { noStore };

  const etag = headers.get("etag");
  if (etag) directives.etag = etag;
  const lastModified = headers.get("last-modified");
  if (lastModified) directives.lastModified = lastModified;

  const maxAge = /max-age\s*=\s*(\d+)/.exec(control);
  if (maxAge?.[1]) {
    directives.expiresAt = new Date(now.getTime() + Number(maxAge[1]) * 1000).toISOString();
    return directives;
  }
  const expires = headers.get("expires");
  if (expires) {
    const parsed = Date.parse(expires);
    if (Number.isFinite(parsed)) directives.expiresAt = new Date(parsed).toISOString();
  }
  return directives;
}

/** Builds the conditional-request headers for a cached entry. */
export function conditionalHeaders<T>(entry: CacheEntry<T> | null): Record<string, string> {
  if (!entry) return {};
  const headers: Record<string, string> = {};
  if (entry.etag) headers["if-none-match"] = entry.etag;
  if (entry.lastModified) headers["if-modified-since"] = entry.lastModified;
  return headers;
}

export function isFresh<T>(entry: CacheEntry<T> | null, now: Date = new Date()): boolean {
  if (!entry?.expiresAt) return false;
  const expires = Date.parse(entry.expiresAt);
  return Number.isFinite(expires) && expires > now.getTime();
}
