import type { CSSProperties, ReactNode } from "react";
import { token } from "./tokens.js";

export interface PanelProps {
  children: ReactNode;
  padding?: number;
  tone?: "default" | "sunken" | "raised";
  style?: CSSProperties;
  className?: string;
  /** Marks the panel as the current selection in Nexus Studio. */
  selected?: boolean;
}

/** The one panel treatment used everywhere, so transparency stays consistent. */
export function Panel({ children, padding = 16, tone = "default", style, className, selected }: PanelProps) {
  const background =
    tone === "sunken" ? token.surfaceSunken : tone === "raised" ? token.surfaceRaised : token.surface;
  return (
    <div
      className={className}
      data-selected={selected ? "true" : undefined}
      style={{
        background,
        opacity: 1,
        border: `1px solid ${selected ? token.accent : token.border}`,
        boxShadow: selected ? `0 0 0 2px ${token.accentSoft}` : "none",
        borderRadius: token.radius,
        padding,
        color: token.textPrimary,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
