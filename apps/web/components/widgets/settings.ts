import type { ActionValue, AudioSourceValue, ImageSourceValue, LinkValue } from "@nexus/schemas";

/**
 * Readers for a widget's own settings.
 *
 * Settings are always reconciled against the property schema before a renderer
 * sees them, so these readers exist for type narrowing rather than for repair.
 */

export function text(settings: Record<string, unknown>, key: string, fallback = ""): string {
  const value = settings[key];
  return typeof value === "string" ? value : fallback;
}

export function toggle(settings: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : fallback;
}

export function amount(settings: Record<string, unknown>, key: string, fallback = 0): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Returns a plain string rather than narrowing to the fallback's literal type,
// so a renderer can compare the result against every option it supports.
export function choice(settings: Record<string, unknown>, key: string, fallback: string): string {
  const value = settings[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function choices(settings: Record<string, unknown>, key: string): string[] {
  const value = settings[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function rows(settings: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = settings[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

export function image(settings: Record<string, unknown>, key: string): ImageSourceValue | null {
  const value = settings[key];
  return typeof value === "object" && value !== null ? (value as ImageSourceValue) : null;
}

export function action(settings: Record<string, unknown>, key: string): ActionValue | null {
  const value = settings[key];
  return typeof value === "object" && value !== null ? (value as ActionValue) : null;
}

export function link(settings: Record<string, unknown>, key: string): LinkValue | null {
  const value = settings[key];
  return typeof value === "object" && value !== null ? (value as LinkValue) : null;
}

export function audio(settings: Record<string, unknown>, key: string): AudioSourceValue | null {
  const value = settings[key];
  return typeof value === "object" && value !== null ? (value as AudioSourceValue) : null;
}
