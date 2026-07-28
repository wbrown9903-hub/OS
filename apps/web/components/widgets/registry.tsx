"use client";

import { WidgetShell } from "@nexus/ui";
import type { WidgetRenderProps, WidgetRenderer } from "./types.js";
import { BreakReminderWidget } from "./renderers/break-reminder.js";
import { ClockWidget } from "./renderers/clock.js";
import { FavouriteAppsWidget } from "./renderers/favourite-apps.js";
import { NotesWidget } from "./renderers/notes.js";
import { OnboardingChecklistWidget } from "./renderers/onboarding-checklist.js";
import { PlaySessionWidget } from "./renderers/play-session.js";
import { QuickLinksWidget } from "./renderers/quick-links.js";
import { RecentFilesWidget } from "./renderers/recent-files.js";
import { RunescapeHeroWidget } from "./renderers/runescape-hero.js";
import { RunescapeNewsWidget } from "./renderers/runescape-news.js";
import { SearchBoxWidget } from "./renderers/search-box.js";
import { SystemStatusWidget } from "./renderers/system-status.js";

/**
 * Maps a widget type to the component that draws it.
 *
 * A type with no bespoke renderer is not an error and never renders a
 * placeholder: `DefinitionDrivenWidget` draws it from its own settings and its
 * data envelope. For a service the user has not connected, the honest and
 * correct interface *is* the "not connected — here is how to connect" card that
 * WidgetShell already renders from the freshness state.
 */
const renderers: Record<string, WidgetRenderer> = {
  "essentials.clock": ClockWidget,
  "essentials.notes": NotesWidget,
  "essentials.quickLinks": QuickLinksWidget,
  "essentials.recentFiles": RecentFilesWidget,
  "essentials.favouriteApps": FavouriteAppsWidget,
  "essentials.systemStatus": SystemStatusWidget,
  "essentials.searchBox": SearchBoxWidget,
  "essentials.onboardingChecklist": OnboardingChecklistWidget,
  "runescape.hero": RunescapeHeroWidget,
  "runescape.news": RunescapeNewsWidget,
  "games.playSession": PlaySessionWidget,
  "games.breakReminder": BreakReminderWidget,
};

function readString(settings: Record<string, unknown>, key: string, fallback: string): string {
  const value = settings[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

/** Renders any registered widget from its settings and data envelope alone. */
export function DefinitionDrivenWidget({ node, settings, data, freshness, loading }: WidgetRenderProps) {
  const title = readString(settings, "title", humaniseType(node.type));
  const subtitle = readString(settings, "subtitle", "");
  const rows = summariseData(data);

  return (
    <WidgetShell
      title={title}
      subtitle={subtitle || undefined}
      freshness={freshness}
      loading={loading ?? false}
      hasData={rows.length > 0}
      emptyMessage="No information has been received for this panel yet."
    >
      <dl style={{ display: "grid", gap: 6, margin: 0 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <dt style={{ color: "var(--nx-text-secondary)", margin: 0 }}>{row.label}</dt>
            <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </WidgetShell>
  );
}

/** "commerce.shopifySalesToday" -> "Shopify sales today" */
function humaniseType(type: string): string {
  const tail = type.includes(".") ? type.slice(type.indexOf(".") + 1) : type;
  const spaced = tail.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Flattens a data payload into label/value rows without inventing anything. */
function summariseData(data: unknown): Array<{ label: string; value: string }> {
  if (data === null || data === undefined) return [];
  if (Array.isArray(data)) {
    return data.slice(0, 6).map((entry, index) => ({
      label: `${index + 1}`,
      value: typeof entry === "string" ? entry : JSON.stringify(entry),
    }));
  }
  if (typeof data === "object") {
    return Object.entries(data as Record<string, unknown>)
      .filter(([, value]) => value !== null && typeof value !== "object")
      .slice(0, 8)
      .map(([key, value]) => ({ label: humaniseType(key), value: String(value) }));
  }
  return [{ label: "Value", value: String(data) }];
}

export function rendererFor(type: string): WidgetRenderer {
  return renderers[type] ?? DefinitionDrivenWidget;
}

export function hasBespokeRenderer(type: string): boolean {
  return type in renderers;
}
