import { Row, RowList, WidgetShell } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { amount, text, toggle } from "../settings.js";
import { asArray, field, relativeTime, str } from "../data.js";

export function RecentFilesWidget({ settings, data, freshness, loading }: WidgetRenderProps) {
  const files = asArray(field(data, "files")).slice(0, Math.round(amount(settings, "count", 6)));

  return (
    <WidgetShell
      title={text(settings, "title", "Recent files")}
      freshness={freshness}
      loading={loading ?? false}
      hasData={files.length > 0}
      emptyMessage={text(settings, "emptyMessage", "No recent files yet.")}
      resolveHref="/settings/desktop"
    >
      <RowList>
        {files.map((file, index) => (
          <Row
            key={str(field(file, "id"), String(index))}
            glyph="◻"
            primary={str(field(file, "name"), "Untitled")}
            secondary={toggle(settings, "showFolder", true) ? str(field(file, "folder")) : undefined}
            trailing={toggle(settings, "showModified", true) ? relativeTime(field(file, "modifiedAt")) ?? undefined : undefined}
            href={str(field(file, "openHref")) || undefined}
          />
        ))}
      </RowList>
    </WidgetShell>
  );
}
