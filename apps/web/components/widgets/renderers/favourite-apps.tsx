import { Badge, EmptyState, WidgetShell, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { amount, rows, text, toggle } from "../settings.js";
import { asArray, field, str } from "../data.js";

export function FavouriteAppsWidget({ settings, data, freshness, loading }: WidgetRenderProps) {
  const apps = rows(settings, "apps");
  const size = amount(settings, "iconSize", 44);
  const installed = new Set(
    asArray(field(data, "installed")).map((entry) => str(field(entry, "name")).toLowerCase()),
  );
  const knowsInstallState = freshness.state === "live" || freshness.state === "cached";

  return (
    <WidgetShell title={text(settings, "title", "Favourite apps")} freshness={freshness} loading={loading ?? false} hasData>
      {apps.length === 0 ? (
        <EmptyState title="No apps added yet" nextStep="Select this widget in Nexus Studio and add the apps you use every day." />
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {apps.map((app, index) => {
            const label = text(app, "label", "Untitled");
            const missing = knowsInstallState && !installed.has(label.toLowerCase());
            return (
              <span key={index} style={{ display: "grid", gap: 4, justifyItems: "center", width: size + 24 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: size,
                    height: size,
                    borderRadius: token.radiusSmall,
                    background: token.surfaceRaised,
                    border: `1px solid ${token.border}`,
                    display: "grid",
                    placeItems: "center",
                    fontSize: size / 2.6,
                    opacity: missing ? 0.55 : 1,
                  }}
                >
                  ▢
                </span>
                {toggle(settings, "showLabels", true) ? (
                  <span style={{ fontSize: 11, color: token.textSecondary, textAlign: "center" }}>{label}</span>
                ) : null}
                {missing ? <Badge tone="caution" glyph="▲">Not installed</Badge> : null}
              </span>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}
