import { Badge, WidgetShell, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { amount, text, toggle } from "../settings.js";

function minutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

export function BreakReminderWidget({ settings, freshness, loading }: WidgetRenderProps) {
  return (
    <WidgetShell title={text(settings, "title", "Take a break")} freshness={freshness} loading={loading ?? false} hasData>
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13, color: token.textPrimary, lineHeight: 1.5 }}>
          {text(settings, "message", "Stand up, look out of the window for twenty seconds.")}
        </p>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge tone="neutral" glyph="↻">Every {minutes(amount(settings, "intervalMinutes", 3000))}</Badge>
          <Badge tone="neutral" glyph="⏸">{minutes(amount(settings, "breakLengthMinutes", 300))} break</Badge>
          {toggle(settings, "respectQuietHours", true) ? (
            <Badge tone="positive" glyph="✓">Silent in quiet hours</Badge>
          ) : (
            <Badge tone="caution" glyph="▲">Ignores quiet hours</Badge>
          )}
        </span>
      </div>
    </WidgetShell>
  );
}
