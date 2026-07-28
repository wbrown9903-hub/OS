import { EmptyState, WidgetShell, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { amount, rows, text, toggle } from "../settings.js";

export function QuickLinksWidget({ settings, freshness, loading }: WidgetRenderProps) {
  const links = rows(settings, "links");
  const columns = Math.max(1, Math.round(amount(settings, "columns", 2)));
  const showIcons = toggle(settings, "showIcons", true);

  return (
    <WidgetShell title={text(settings, "title", "Quick links")} freshness={freshness} loading={loading ?? false} hasData>
      {links.length === 0 ? (
        <EmptyState
          title="No links yet"
          nextStep="Open Nexus Studio, select this widget and add your first link under “Links”."
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 8 }}>
          {links.map((row, index) => {
            const destination = row.destination as { url?: string; label?: string } | undefined;
            const url = typeof destination?.url === "string" ? destination.url : "";
            const label = destination?.label || url || "Untitled link";
            return (
              <a
                key={index}
                href={url || undefined}
                aria-disabled={url ? undefined : "true"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: token.radiusSmall,
                  background: token.surfaceSunken,
                  border: `1px solid ${token.border}`,
                  color: url ? token.textPrimary : token.textMuted,
                  textDecoration: "none",
                  fontSize: 13,
                  minWidth: 0,
                }}
              >
                {showIcons ? <span aria-hidden="true">↗</span> : null}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
              </a>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}
