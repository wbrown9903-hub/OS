import { z } from "zod";

/**
 * The configuration document.
 *
 * Everything the user can see or arrange lives in exactly one immutable tree:
 * workspaces -> pages -> zones -> widgets. Nothing about the interface is stored
 * anywhere else, which is what makes export, import, version history, "reset this
 * component", draft/publish and recovery mode a single mechanism instead of six.
 *
 * Crucially, a widget records *intent* — which zone it belongs to, how much space
 * it wants, how important it is, when it should be visible — and never pixel
 * coordinates. Pixels are computed by the resolver for the display it is actually
 * being drawn on, so one layout is correct on a laptop, an external 5K display and
 * a phone-sized window without the user maintaining three layouts.
 */

export const SPAN_MIN = 1;
export const SPAN_MAX = 12;

/** Visibility rules are declarative so they can be evaluated identically on the
 *  server, in the browser and in tests — never as ad-hoc code inside a widget. */
export const visibilityRuleSchema = z.object({
  /** Hide unless the named connection is currently usable. */
  requiresConnection: z.string().nullable().default(null),
  /** Hide unless the Mac Bridge is reachable (e.g. "launch app" widgets). */
  requiresBridge: z.boolean().default(false),
  /** Hide unless a named macOS permission has been granted. */
  requiresPermission: z.string().nullable().default(null),
  /** Only show between these hours (0–23, inclusive start, exclusive end). */
  hours: z.object({ from: z.number().min(0).max(23), to: z.number().min(0).max(23) }).nullable().default(null),
  /** Only show on displays at least this wide, in CSS pixels. */
  minimumWidth: z.number().nullable().default(null),
  /** Hidden by the user without being deleted. */
  hidden: z.boolean().default(false),
});
export type VisibilityRule = z.infer<typeof visibilityRuleSchema>;

export const widgetNodeSchema = z.object({
  id: z.string(),
  /** Identifier of a registered widget definition, e.g. "runescape.hero". */
  type: z.string(),
  /** Which zone of the page this belongs to. */
  zone: z.string().default("main"),
  /** Ordering within the zone. Fractional values allow insertion without renumbering. */
  order: z.number().default(0),
  /** Requested width in a 12-column intent grid, and height in row units. */
  span: z.object({ columns: z.number().min(SPAN_MIN).max(SPAN_MAX), rows: z.number().min(1).max(12) }),
  /** Lower numbers survive longer when space runs short on a narrow display. */
  priority: z.number().min(0).max(100).default(50),
  /** Pinned widgets are never dropped by the resolver and never reordered. */
  pinned: z.boolean().default(false),
  visibility: visibilityRuleSchema.default({}),
  /** Validated against the widget definition's property schema. */
  settings: z.record(z.string(), z.unknown()).default({}),
  /** How often live data refreshes, in seconds. 0 means only on demand. */
  refreshSeconds: z.number().min(0).max(86400).default(0),
  /** Optional per-widget keyboard shortcut, e.g. "cmd+shift+1". */
  shortcut: z.string().nullable().default(null),
});
export type WidgetNode = z.infer<typeof widgetNodeSchema>;

export const zoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** How the resolver arranges this zone's children. */
  layout: z.enum(["grid", "row", "column", "rail"]).default("grid"),
  /** Zones can be collapsed by the user without losing their contents. */
  collapsed: z.boolean().default(false),
});
export type Zone = z.infer<typeof zoneSchema>;

export const pageSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().default("square.grid.2x2"),
  /** Shown in navigation; a page can exist without being listed. */
  showInNavigation: z.boolean().default(true),
  zones: z.array(zoneSchema).default([]),
  widgets: z.array(widgetNodeSchema).default([]),
});
export type Page = z.infer<typeof pageSchema>;

export const workspaceSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().default("rectangle.3.group"),
  /** Actions run when the workspace is entered, e.g. open apps, arrange windows. */
  onEnter: z.array(z.object({ type: z.string(), target: z.string() })).default([]),
  pageIds: z.array(z.string()).default([]),
  /** Muted notification categories while this workspace is active. */
  silencedCategories: z.array(z.string()).default([]),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const dockItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
  action: z.object({ type: z.string(), target: z.string() }),
  /** Shown with a "not installed" treatment rather than being hidden, so the user
   *  can still discover and install the application. */
  requiresApplication: z.string().nullable().default(null),
});
export type DockItem = z.infer<typeof dockItemSchema>;

export const CONFIG_SCHEMA_VERSION = 1;

export const configDocumentSchema = z.object({
  schemaVersion: z.number().default(CONFIG_SCHEMA_VERSION),
  /** Increments on every committed operation. Used for optimistic concurrency. */
  revision: z.number().default(0),
  productName: z.string().default("Nexus OS"),
  themeId: z.string().default("nexus-obsidian"),
  pages: z.array(pageSchema).default([]),
  workspaces: z.array(workspaceSchema).default([]),
  dock: z.array(dockItemSchema).default([]),
  topBar: z
    .object({
      enabled: z.boolean().default(true),
      showClock: z.boolean().default(true),
      showSearch: z.boolean().default(true),
      showSystemStatus: z.boolean().default(true),
      items: z.array(z.object({ id: z.string(), label: z.string(), action: z.string() })).default([]),
    })
    .default({}),
  preferences: z
    .object({
      experienceLevel: z.enum(["beginner", "standard", "advanced", "developer"]).default("standard"),
      animationIntensity: z.number().min(0).max(1).default(0.8),
      soundVolume: z.number().min(0).max(1).default(0.5),
      soundsEnabled: z.boolean().default(true),
      cornerRadius: z.number().min(0).max(28).default(14),
      panelTransparency: z.number().min(0).max(1).default(0.72),
      density: z.enum(["comfortable", "compact"]).default("comfortable"),
      fontId: z.string().default("system"),
      gamificationEnabled: z.boolean().default(true),
      quietHours: z
        .object({ enabled: z.boolean().default(false), from: z.number().default(22), to: z.number().default(7) })
        .default({}),
    })
    .default({}),
});
export type ConfigDocument = z.infer<typeof configDocumentSchema>;

/* -------------------------------------------------------------------------- */
/* Addressing                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A stable address for any editable thing in the document. Operations, version
 * history entries, "reset this component" and the audit log all speak this
 * language, which is why they interoperate without special cases.
 */
export type NodeAddress =
  | { kind: "document" }
  | { kind: "preferences" }
  | { kind: "topBar" }
  | { kind: "dock" }
  | { kind: "dockItem"; dockItemId: string }
  | { kind: "page"; pageId: string }
  | { kind: "zone"; pageId: string; zoneId: string }
  | { kind: "widget"; pageId: string; widgetId: string }
  | { kind: "workspace"; workspaceId: string };

export function addressToString(address: NodeAddress): string {
  switch (address.kind) {
    case "document":
    case "preferences":
    case "topBar":
    case "dock":
      return address.kind;
    case "dockItem":
      return `dockItem/${address.dockItemId}`;
    case "page":
      return `page/${address.pageId}`;
    case "zone":
      return `page/${address.pageId}/zone/${address.zoneId}`;
    case "widget":
      return `page/${address.pageId}/widget/${address.widgetId}`;
    case "workspace":
      return `workspace/${address.workspaceId}`;
  }
}

export function findPage(document: ConfigDocument, pageId: string): Page | undefined {
  return document.pages.find((page) => page.id === pageId);
}

export function findWidget(
  document: ConfigDocument,
  pageId: string,
  widgetId: string,
): WidgetNode | undefined {
  return findPage(document, pageId)?.widgets.find((widget) => widget.id === widgetId);
}

/** Order value that places a new widget at the end of a zone without renumbering. */
export function nextOrderInZone(page: Page, zoneId: string): number {
  const orders = page.widgets.filter((widget) => widget.zone === zoneId).map((widget) => widget.order);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

/** Order value that places a widget between two others — how drag-to-reorder works. */
export function orderBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}
