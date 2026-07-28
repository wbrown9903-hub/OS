/**
 * Every colour, radius and duration in Nexus OS comes from a `--nx-*` custom
 * property so a theme change never needs a recompile, and so the resolver's
 * accessibility clamps apply to components it has never heard of.
 */
export const token = {
  canvas: "var(--nx-canvas)",
  canvasInset: "var(--nx-canvas-inset)",
  surface: "var(--nx-surface)",
  surfaceRaised: "var(--nx-surface-raised)",
  surfaceSunken: "var(--nx-surface-sunken)",
  border: "var(--nx-border)",
  borderStrong: "var(--nx-border-strong)",
  textPrimary: "var(--nx-text-primary)",
  textSecondary: "var(--nx-text-secondary)",
  textMuted: "var(--nx-text-muted)",
  accent: "var(--nx-accent)",
  accentSoft: "var(--nx-accent-soft)",
  accentContrast: "var(--nx-accent-contrast)",
  success: "var(--nx-success)",
  warning: "var(--nx-warning)",
  danger: "var(--nx-danger)",
  info: "var(--nx-info)",
  radius: "var(--nx-radius, 14px)",
  radiusSmall: "var(--nx-radius-small, 8px)",
  space: "var(--nx-space-unit, 8px)",
  shadow: "var(--nx-shadow)",
} as const;

/** Durations are always expressed through the animation scale the resolver sets. */
export function duration(milliseconds: number): string {
  return `calc(${milliseconds}ms * var(--nx-animation-scale, 1))`;
}

/**
 * Resolves a stored colour value, which is either a hex colour or a reference to
 * a theme token such as "token:accent".
 */
export function resolveColour(value: string, fallback = token.accent): string {
  if (!value) return fallback;
  if (value.startsWith("token:")) {
    const name = value.slice("token:".length).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    return `var(--nx-${name}, ${fallback})`;
  }
  return value;
}
