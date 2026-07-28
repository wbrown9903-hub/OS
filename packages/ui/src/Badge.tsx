import type { ReactNode } from "react";
import { token } from "./tokens.js";

export type BadgeTone = "positive" | "neutral" | "caution" | "critical" | "accent";

/**
 * A badge always carries a glyph and a word, never colour alone — the state has to
 * survive being printed in black and white or read by someone who cannot see the hue.
 */
export function Badge({ tone = "neutral", glyph, children }: { tone?: BadgeTone; glyph?: string; children: ReactNode }) {
  const colour = {
    positive: token.success,
    neutral: token.textSecondary,
    caution: token.warning,
    critical: token.danger,
    accent: token.accent,
  }[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: `1px solid ${colour}`,
        color: colour,
        borderRadius: 999,
        padding: "1px 8px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}
    >
      {glyph ? <span aria-hidden="true">{glyph}</span> : null}
      {children}
    </span>
  );
}
