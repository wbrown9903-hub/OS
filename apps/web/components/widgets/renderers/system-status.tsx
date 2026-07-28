import { Badge, ProgressBar, WidgetShell, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { amount, choice, choices, text } from "../settings.js";
import { field, num } from "../data.js";

const LABELS: Record<string, string> = {
  cpu: "Processor",
  memory: "Memory",
  disk: "Disk space",
  battery: "Battery",
  network: "Network",
  uptime: "Uptime",
};

export function SystemStatusWidget({ settings, data, freshness, loading }: WidgetRenderProps) {
  const metrics = choices(settings, "metrics");
  const display = choice(settings, "display", "bars");
  const warnAbove = amount(settings, "warnAbovePercent", 85);
  const readings = metrics.map((metric) => ({ metric, percent: num(field(data, metric)) }));
  const hasAny = readings.some((reading) => reading.percent !== null);

  return (
    <WidgetShell
      title={text(settings, "title", "System")}
      freshness={freshness}
      loading={loading ?? false}
      hasData={hasAny}
      emptyMessage="No readings received from this Mac."
      resolveHref="/settings/desktop"
    >
      <div style={{ display: "grid", gap: 8 }}>
        {readings.map(({ metric, percent }) => (
          <div key={metric} style={{ display: "grid", gap: 3 }}>
            <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: token.textSecondary }}>
              <span>{LABELS[metric] ?? metric}</span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                {percent === null ? "—" : `${Math.round(percent)}%`}
                {percent !== null && percent >= warnAbove ? (
                  <Badge tone="caution" glyph="▲">Needs attention</Badge>
                ) : null}
              </span>
            </span>
            {display !== "figures" ? (
              <ProgressBar
                value={percent === null ? null : percent / 100}
                label={LABELS[metric] ?? metric}
                colour={percent !== null && percent >= warnAbove ? "token:warning" : "token:accent"}
              />
            ) : null}
          </div>
        ))}
      </div>
    </WidgetShell>
  );
}
