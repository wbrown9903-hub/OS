import { randomUUID } from "node:crypto";

/**
 * Identifier and text helpers shared by the server, the seed and the tests.
 * Deliberately dependency-free so they can be used on either side of the wire.
 */

/** Readable, sortable identifier: `wid_lq3k8f_4b2a`. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36);
  const random = randomUUID().replace(/-/g, "").slice(0, 6);
  return `${prefix}_${time}_${random}`;
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Trims and collapses whitespace without destroying paragraph breaks. */
export function tidyText(value: string): string {
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function truncate(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  return `${value.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

/** Stable, human-readable byte size for backup and media listings. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].filter((value) => value.length > 0);
}
