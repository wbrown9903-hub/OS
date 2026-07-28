import type { ReactNode } from "react";
import { token } from "./tokens.js";

export interface EmptyStateProps {
  /** What is happening, in plain language. */
  title: string;
  /** What the person can do about it. Never omitted. */
  nextStep: string;
  /** A link straight to the screen that fixes it. */
  actionHref?: string | null;
  actionLabel?: string;
  glyph?: string;
  children?: ReactNode;
}

/**
 * Unavailable never means invisible. Every empty or blocked widget explains itself
 * and offers the next step, rather than showing an empty box.
 */
export function EmptyState({ title, nextStep, actionHref, actionLabel, glyph = "○", children }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        placeItems: "center",
        textAlign: "center",
        padding: "18px 12px",
        color: token.textSecondary,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 20, color: token.textMuted }}>
        {glyph}
      </span>
      <strong style={{ color: token.textPrimary, fontSize: 13, fontWeight: 600 }}>{title}</strong>
      <span style={{ fontSize: 12, maxWidth: "34ch", lineHeight: 1.5 }}>{nextStep}</span>
      {actionHref ? (
        <a
          href={actionHref}
          style={{ color: token.accent, fontSize: 12, fontWeight: 600, textDecoration: "underline" }}
        >
          {actionLabel ?? "Fix this"}
        </a>
      ) : null}
      {children}
    </div>
  );
}
