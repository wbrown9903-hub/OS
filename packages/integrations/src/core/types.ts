/**
 * The shapes every integration maps into.
 *
 * These mirror the `MetricSnapshot` and `CommerceEvent` models in
 * `packages/database/schema.prisma` exactly, minus the database-generated `id`.
 * Nothing in this package writes to the database; it produces these records and
 * a service layer persists them. That keeps the clients pure and testable.
 *
 * Every record carries `fetchedAt`, because a number without a time is a lie —
 * the UI must always be able to say Live / Cached / Last updated.
 */

/** Currencies whose minor unit is not 1/100. */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0,
  RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2;
}

/**
 * Converts a decimal money string ("129.95") to integer minor units, which is
 * the only representation stored. Rounds half-up on the minor unit so totals
 * never drift by a penny.
 */
export function toMinorUnits(amount: string | number | null | undefined, currency: string): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** minorUnitExponent(currency);
  return Math.round(value * factor);
}

export function formatMinorUnits(valueMinor: number, currency: string, locale = "en-GB"): string {
  const exponent = minorUnitExponent(currency);
  const value = valueMinor / 10 ** exponent;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: exponent }).format(value);
  } catch {
    return `${value.toFixed(exponent)} ${currency}`;
  }
}

/** A row destined for `MetricSnapshot`. */
export interface MetricSnapshotInput {
  connectionId: string;
  /** Stable key, e.g. "shopify.sales.total" or "wordpress.updates.plugins". */
  metric: string;
  valueMinor: number;
  valueText: string;
  currency: string;
  /** ISO 8601. Inclusive lower bound of the window this metric describes. */
  windowStart: string;
  /** ISO 8601. Exclusive upper bound. */
  windowEnd: string;
  /** ISO 8601 moment the data left the remote service. Never omitted. */
  fetchedAt: string;
  stale: boolean;
}

export interface MetricSnapshotOptions {
  valueMinor?: number;
  valueText?: string;
  currency?: string;
  stale?: boolean;
}

export function metricSnapshot(
  connectionId: string,
  metric: string,
  window: { start: Date | string; end: Date | string },
  fetchedAt: Date | string,
  options: MetricSnapshotOptions = {},
): MetricSnapshotInput {
  return {
    connectionId,
    metric,
    valueMinor: options.valueMinor ?? 0,
    valueText: options.valueText ?? "",
    currency: options.currency ?? "",
    windowStart: toIso(window.start),
    windowEnd: toIso(window.end),
    fetchedAt: toIso(fetchedAt),
    stale: options.stale ?? false,
  };
}

/** A row destined for `CommerceEvent`. */
export interface CommerceEventInput {
  connectionId: string;
  source: string;
  /** "order.paid" | "order.refunded" | "order.fulfilled" | "order.cancelled" | … */
  kind: string;
  /** The remote id. Combined with `source` + `kind` this is the dedup key. */
  externalId: string;
  currency: string;
  amountMinor: number;
  occurredAt: string;
  summary: string;
  /** Serialised, already-redacted payload. Stored as a string per the schema. */
  raw: string;
}

export function toIso(value: Date | string | number): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

/** A payload plus the moment it was fetched — the unit widgets receive. */
export interface Fetched<T> {
  data: T;
  fetchedAt: string;
  /** True when the value came from a local cache rather than the network. */
  fromCache: boolean;
  /** Present when the service told us how long the answer stays good. */
  expiresAt?: string;
}

export function fetchedNow<T>(data: T, fetchedAt: Date | string = new Date()): Fetched<T> {
  return { data, fetchedAt: toIso(fetchedAt), fromCache: false };
}
