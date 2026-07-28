import { Button, ProgressBar, Row, RowList, WidgetShell, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { rows, text, toggle } from "../settings.js";

export function OnboardingChecklistWidget({ settings, freshness, loading }: WidgetRenderProps) {
  const steps = rows(settings, "steps").filter((step) => text(step, "label").length > 0);
  const done = steps.filter((step) => toggle(step, "done")).length;
  const ordered = [...steps].sort((a, b) => Number(toggle(a, "done")) - Number(toggle(b, "done")));

  return (
    <WidgetShell
      title={text(settings, "title", "Finish setting up")}
      subtitle={toggle(settings, "showProgress", true) ? `${done} of ${steps.length} done` : undefined}
      freshness={freshness}
      loading={loading ?? false}
      hasData={steps.length > 0}
      emptyMessage="No steps left."
    >
      <div style={{ display: "grid", gap: 8 }}>
        {toggle(settings, "showProgress", true) ? (
          <ProgressBar value={steps.length === 0 ? null : done / steps.length} label="Setup progress" />
        ) : null}
        <RowList>
          {ordered.map((step, index) => {
            const complete = toggle(step, "done");
            return (
              <Row
                key={index}
                glyph={complete ? "✓" : "○"}
                primary={
                  <span style={{ color: complete ? token.textMuted : token.textPrimary, textDecoration: complete ? "line-through" : "none" }}>
                    {text(step, "label")}
                  </span>
                }
                secondary={text(step, "detail") || undefined}
                trailing={complete ? undefined : <Button size="small" variant="quiet">Do this</Button>}
              />
            );
          })}
        </RowList>
      </div>
    </WidgetShell>
  );
}
