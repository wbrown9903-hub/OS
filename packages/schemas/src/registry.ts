import type { PropertySchema } from "./property.js";

/**
 * A widget definition is the *only* file needed to add a widget to Nexus OS.
 *
 * From it, the product derives the Studio inspector, the validator, the defaults,
 * the "Add widget" gallery entry, the contextual help, the reset behaviour and the
 * data-refresh policy. There is deliberately no place to put per-widget editor
 * code, because that is what causes editors and renderers to drift apart.
 */
export interface WidgetDefinition {
  /** Stable identifier, e.g. "runescape.hero". Never change it once shipped. */
  type: string;
  /** Name shown in the widget gallery. */
  name: string;
  /** One sentence explaining what the widget shows or does. */
  summary: string;
  /** Gallery grouping, e.g. "Games", "Commerce", "AI", "System". */
  category: WidgetCategory;
  /** SF Symbols-style icon name, also used by the web shell's icon set. */
  icon: string;
  /** The single source of truth for everything editable about this widget. */
  schema: PropertySchema;
  /** Size the widget is added at, expressed in the 12-column intent grid. */
  defaultSpan: { columns: number; rows: number };
  /** Smallest size a user may resize it to, so it can never become unreadable. */
  minimumSpan: { columns: number; rows: number };
  /** Connection this widget needs, e.g. "shopify". Drives the unavailable state. */
  requiresConnection?: string;
  /** True when the widget needs the native Mac Bridge to do anything useful. */
  requiresBridge?: boolean;
  /** macOS permission required, e.g. "accessibility". */
  requiresPermission?: string;
  /** Server route that supplies this widget's live data, if any. */
  dataEndpoint?: string;
  /** Default refresh cadence in seconds. 0 means the widget is static. */
  defaultRefreshSeconds?: number;
  /** Identifier of the help article opened by the widget's "?" button. */
  helpTopicId?: string;
  /** Shown in the gallery when the widget has no data yet. */
  previewHint?: string;
}

export type WidgetCategory =
  | "Essentials"
  | "Games"
  | "AI"
  | "Commerce"
  | "Knowledge"
  | "System"
  | "Automation"
  | "Web"
  | "Finance";

export class WidgetRegistry {
  private readonly definitions = new Map<string, WidgetDefinition>();

  register(definition: WidgetDefinition): this {
    if (this.definitions.has(definition.type)) {
      throw new Error(`Two widgets are both registered as “${definition.type}”.`);
    }
    this.definitions.set(definition.type, definition);
    return this;
  }

  registerAll(definitions: WidgetDefinition[]): this {
    for (const definition of definitions) this.register(definition);
    return this;
  }

  get(type: string): WidgetDefinition | undefined {
    return this.definitions.get(type);
  }

  /**
   * Unknown types are expected in normal use: a plugin may be disabled, or a
   * layout may have been imported from a newer version. The caller renders a
   * "this widget is unavailable" card rather than failing the whole page.
   */
  require(type: string): WidgetDefinition {
    const definition = this.definitions.get(type);
    if (!definition) {
      throw new Error(`No widget is registered as “${type}”.`);
    }
    return definition;
  }

  all(): WidgetDefinition[] {
    return [...this.definitions.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  byCategory(): Array<{ category: WidgetCategory; widgets: WidgetDefinition[] }> {
    const order: WidgetCategory[] = [
      "Essentials", "AI", "Games", "Commerce", "Knowledge", "Automation", "System", "Web", "Finance",
    ];
    const grouped = new Map<WidgetCategory, WidgetDefinition[]>();
    for (const definition of this.all()) {
      if (!grouped.has(definition.category)) grouped.set(definition.category, []);
      grouped.get(definition.category)!.push(definition);
    }
    return order
      .filter((category) => grouped.has(category))
      .map((category) => ({ category, widgets: grouped.get(category)! }));
  }

  search(query: string): WidgetDefinition[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return this.all();
    return this.all().filter((definition) =>
      [definition.name, definition.summary, definition.type, definition.category]
        .some((field) => field.toLowerCase().includes(needle)),
    );
  }
}

/** How a widget's data is currently sourced. Never rendered as plain "OK". */
export type DataFreshness =
  | { state: "live"; fetchedAt: string }
  | { state: "cached"; fetchedAt: string; ageSeconds: number }
  | { state: "stale"; fetchedAt: string; ageSeconds: number }
  | { state: "unavailable"; reason: string; nextStep: string }
  | { state: "notConfigured"; nextStep: string };

export interface WidgetDataEnvelope<T> {
  data: T | null;
  freshness: DataFreshness;
}

/** Chooses the freshness label from when data was fetched and how often it refreshes. */
export function freshnessFor(
  fetchedAt: Date | null,
  refreshSeconds: number,
  now: Date = new Date(),
): DataFreshness {
  if (!fetchedAt) {
    return { state: "notConfigured", nextStep: "Connect this service to see live information." };
  }
  const ageSeconds = Math.max(0, Math.round((now.getTime() - fetchedAt.getTime()) / 1000));
  const window = refreshSeconds > 0 ? refreshSeconds : 300;
  if (ageSeconds <= window) return { state: "live", fetchedAt: fetchedAt.toISOString() };
  if (ageSeconds <= window * 6) return { state: "cached", fetchedAt: fetchedAt.toISOString(), ageSeconds };
  return { state: "stale", fetchedAt: fetchedAt.toISOString(), ageSeconds };
}

/** Human wording for the freshness badge, so every widget says the same thing. */
export function describeFreshness(freshness: DataFreshness): { label: string; tone: "positive" | "neutral" | "caution" | "critical" } {
  switch (freshness.state) {
    case "live":
      return { label: "Live", tone: "positive" };
    case "cached":
      return { label: `Cached ${formatAge(freshness.ageSeconds)} ago`, tone: "neutral" };
    case "stale":
      return { label: `Last updated ${formatAge(freshness.ageSeconds)} ago`, tone: "caution" };
    case "unavailable":
      return { label: freshness.reason, tone: "critical" };
    case "notConfigured":
      return { label: "Not connected", tone: "neutral" };
  }
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}
