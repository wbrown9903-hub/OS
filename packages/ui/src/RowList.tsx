import type { ReactNode } from "react";
import { token } from "./tokens.js";

export interface RowListProps {
  children: ReactNode;
  dense?: boolean;
}

export function RowList({ children, dense }: RowListProps) {
  return <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: dense ? 2 : 6 }}>{children}</ul>;
}

export interface RowProps {
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  glyph?: string;
  href?: string;
  onSelect?: () => void;
  dense?: boolean;
}

export function Row({ primary, secondary, trailing, glyph, href, onSelect, dense }: RowProps) {
  const body = (
    <span style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minWidth: 0 }}>
      {glyph ? (
        <span aria-hidden="true" style={{ color: token.textMuted, fontSize: 13, width: 16, textAlign: "center" }}>
          {glyph}
        </span>
      ) : null}
      <span style={{ display: "grid", gap: 1, flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            color: token.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {primary}
        </span>
        {secondary ? (
          <span style={{ fontSize: 11, color: token.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {secondary}
          </span>
        ) : null}
      </span>
      {trailing ? <span style={{ fontSize: 12, color: token.textSecondary, flexShrink: 0 }}>{trailing}</span> : null}
    </span>
  );

  const padding = dense ? "4px 6px" : "7px 8px";

  return (
    <li>
      {href ? (
        <a
          href={href}
          style={{ display: "block", padding, borderRadius: token.radiusSmall, textDecoration: "none", background: token.surfaceSunken }}
        >
          {body}
        </a>
      ) : onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding,
            borderRadius: token.radiusSmall,
            border: `1px solid ${token.border}`,
            background: token.surfaceSunken,
            cursor: "pointer",
            color: "inherit",
          }}
        >
          {body}
        </button>
      ) : (
        <div style={{ padding, borderRadius: token.radiusSmall, background: token.surfaceSunken }}>{body}</div>
      )}
    </li>
  );
}
