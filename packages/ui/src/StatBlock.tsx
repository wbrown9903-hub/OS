import type { ReactNode } from "react";
import { token } from "./tokens.js";

export interface StatBlockProps {
  label: string;
  /** Already formatted, or null when there is genuinely no figure to show. */
  value: string | null;
  unit?: string;
  /** Change against an earlier period, with its own wording. */
  change?: { label: string; direction: "up" | "down" | "flat"; good: boolean | null } | null;
  caption?: ReactNode;
}

/**
 * One figure. When `value` is null it prints an em dash and says so — Nexus OS
 * never renders a number it did not receive.
 */
export function StatBlock({ label, value, unit, change, caption }: StatBlockProps) {
  const arrow = change ? { up: "▲", down: "▼", flat: "—" }[change.direction] : null;
  const changeColour = change === null || change === undefined || change.good === null
    ? token.textSecondary
    : change.good
      ? token.success
      : token.danger;

  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span style={{ fontSize: 12, color: token.textSecondary }}>{label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 650, color: token.textPrimary, letterSpacing: -0.5 }}>
          {value ?? "—"}
        </span>
        {value !== null && unit ? <span style={{ fontSize: 13, color: token.textSecondary }}>{unit}</span> : null}
      </span>
      {value === null ? (
        <span style={{ fontSize: 12, color: token.textMuted }}>No figure received yet.</span>
      ) : null}
      {value !== null && change ? (
        <span style={{ fontSize: 12, color: changeColour, display: "inline-flex", gap: 4 }}>
          <span aria-hidden="true">{arrow}</span>
          {change.label}
        </span>
      ) : null}
      {caption ? <span style={{ fontSize: 12, color: token.textMuted }}>{caption}</span> : null}
    </div>
  );
}
