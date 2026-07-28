/**
 * Readers for data that arrived from a service.
 *
 * Everything here is deliberately defensive and never invents a value: when a
 * field is missing the reader returns null and the renderer shows an em dash with
 * the freshness badge explaining why, rather than a plausible-looking number.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function field(value: unknown, key: string): unknown {
  return asRecord(value)?.[key];
}

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Formats a figure for display, or returns null so the caller shows an em dash. */
export function formatNumber(
  value: number | null,
  options: { decimals?: number; currency?: string | null } = {},
): string | null {
  if (value === null) return null;
  const decimals = options.decimals ?? 0;
  if (options.currency && options.currency !== "shop" && options.currency !== "none" && options.currency !== "native") {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: options.currency,
        maximumFractionDigits: decimals,
      }).format(value);
    } catch {
      // An unknown currency code is a configuration problem, not a reason to hide
      // the figure. Fall through to plain formatting.
    }
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Turns a stored comparison payload into the wording used under every figure. */
export function changeFrom(
  value: unknown,
  direction: "higherIsBetter" | "lowerIsBetter" | "neutral" = "higherIsBetter",
): { label: string; direction: "up" | "down" | "flat"; good: boolean | null } | null {
  const record = asRecord(value);
  if (!record) return null;
  const percent = num(record.percent);
  const label = str(record.label);
  if (percent === null && !label) return null;
  const arrow = percent === null || Math.abs(percent) < 0.05 ? "flat" : percent > 0 ? "up" : "down";
  const good =
    direction === "neutral" || arrow === "flat" ? null : direction === "higherIsBetter" ? arrow === "up" : arrow === "down";
  return {
    label: label || `${percent! > 0 ? "+" : ""}${percent!.toFixed(1)}% ${str(record.comparedTo, "on the earlier period")}`,
    direction: arrow,
    good,
  };
}

export function relativeTime(iso: unknown): string | null {
  const value = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (Number.isNaN(value)) return null;
  const seconds = Math.round((Date.now() - value) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}
