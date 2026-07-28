import { Row, RowList, WidgetShell, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { amount, text, toggle } from "../settings.js";
import { asArray, field, relativeTime, str } from "../data.js";

export function RunescapeNewsWidget({ settings, data, freshness, loading }: WidgetRenderProps) {
  const stories = asArray(field(data, "stories")).slice(0, Math.round(amount(settings, "count", 5)));

  return (
    <WidgetShell
      title={text(settings, "title", "RuneScape news")}
      freshness={freshness}
      loading={loading ?? false}
      hasData={stories.length > 0}
      emptyMessage={text(settings, "emptyMessage", "No stories in the feed right now.")}
      resolveHref="/settings/connections/runescape"
      footer="Official feed, shown as published. Nexus OS never posts on your behalf."
    >
      <RowList>
        {stories.map((story, index) => (
          <Row
            key={str(field(story, "id"), String(index))}
            glyph="▤"
            primary={str(field(story, "title"), "Untitled post")}
            secondary={
              toggle(settings, "showSummaries", true) ? (
                <span style={{ color: token.textSecondary }}>{str(field(story, "summary"))}</span>
              ) : undefined
            }
            trailing={relativeTime(field(story, "publishedAt")) ?? undefined}
            href={str(field(story, "url")).startsWith("https://") ? str(field(story, "url")) : undefined}
          />
        ))}
      </RowList>
    </WidgetShell>
  );
}
