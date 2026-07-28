import type { ReactNode } from "react";
import type { DataFreshness } from "@nexus/schemas";
import { EmptyState } from "./EmptyState.js";
import { FreshnessBadge } from "./FreshnessBadge.js";
import { Panel } from "./Panel.js";
import { Skeleton } from "./Skeleton.js";
import { token } from "./tokens.js";

export interface WidgetShellProps {
  title?: string;
  subtitle?: string;
  freshness: DataFreshness;
  /** True while the first fetch is in flight. Shows the skeleton. */
  loading?: boolean;
  /**
   * Whether real data arrived. False renders an explanation, never an empty box
   * and never a fabricated figure.
   */
  hasData: boolean;
  /** Wording used when the widget is connected and working but has nothing to list. */
  emptyMessage?: string;
  /** Where to go to fix an unavailable state. */
  resolveHref?: string | null;
  actions?: ReactNode;
  footer?: ReactNode;
  padding?: number;
  selected?: boolean;
  children: ReactNode;
}

/**
 * The frame every widget renderer uses.
 *
 * It owns the four things every widget must get right — the freshness label, the
 * loading skeleton, the "no data" explanation and the unavailable state — so a
 * renderer cannot forget any of them.
 */
export function WidgetShell({
  title,
  subtitle,
  freshness,
  loading = false,
  hasData,
  emptyMessage = "Nothing to show yet.",
  resolveHref,
  actions,
  footer,
  padding = 16,
  selected,
  children,
}: WidgetShellProps) {
  const blocked = freshness.state === "unavailable" || freshness.state === "notConfigured";

  return (
    <Panel padding={padding} selected={selected} style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      {(title || actions) && (
        <header style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
            {title ? (
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 650, color: token.textPrimary, letterSpacing: 0.1 }}>
                {title}
              </h3>
            ) : null}
            {subtitle ? (
              <p style={{ margin: 0, fontSize: 11, color: token.textSecondary }}>{subtitle}</p>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <FreshnessBadge freshness={freshness} />
            {actions}
          </div>
        </header>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <Skeleton rows={3} />
        ) : blocked ? (
          <EmptyState
            glyph={freshness.state === "unavailable" ? "▲" : "○"}
            title={freshness.state === "unavailable" ? freshness.reason : "Not connected"}
            nextStep={freshness.nextStep}
            actionHref={resolveHref ?? null}
            actionLabel="Fix this"
          />
        ) : hasData ? (
          children
        ) : (
          <EmptyState title={emptyMessage} nextStep="Nothing has been received for this period. Nexus OS will not invent a figure." />
        )}
      </div>

      {footer ? <footer style={{ fontSize: 11, color: token.textMuted }}>{footer}</footer> : null}
    </Panel>
  );
}
