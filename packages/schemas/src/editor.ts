import { defaultsForSchema, type PropertySchema } from "./property.js";
import {
  type ConfigDocument,
  type WidgetNode,
  findPage,
  nextOrderInZone,
  orderBetween,
} from "./document.js";
import { OperationError, type Operation, type Path, commit } from "./operations.js";

/**
 * Editor gestures.
 *
 * Each of these is a thin composition of the four primitive operations, so every
 * gesture automatically gains undo, version history, draft/publish and audit
 * without writing a line of code for any of them.
 */

const pagePath = (pageId: string): Path => ["pages", { id: pageId }];
const widgetsPath = (pageId: string): Path => [...pagePath(pageId), "widgets"];

function widgetIndex(document: ConfigDocument, pageId: string, widgetId: string): number {
  const page = findPage(document, pageId);
  if (!page) {
    throw new OperationError("That page no longer exists.", "Choose a page from the navigation bar.");
  }
  const index = page.widgets.findIndex((widget) => widget.id === widgetId);
  if (index === -1) {
    throw new OperationError(
      "That widget has already been removed.",
      "Reload the page to see the current layout.",
    );
  }
  return index;
}

export function newWidgetId(type: string): string {
  const slug = type.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addWidget(
  document: ConfigDocument,
  options: {
    pageId: string;
    type: string;
    schema: PropertySchema;
    zoneId?: string;
    span?: { columns: number; rows: number };
    settings?: Record<string, unknown>;
    label?: string;
  },
) {
  const page = findPage(document, options.pageId);
  if (!page) {
    throw new OperationError("That page no longer exists.", "Choose a page from the navigation bar.");
  }
  const zoneId = options.zoneId ?? page.zones[0]?.id ?? "main";
  const node: WidgetNode = {
    id: newWidgetId(options.type),
    type: options.type,
    zone: zoneId,
    order: nextOrderInZone(page, zoneId),
    span: options.span ?? { columns: 4, rows: 2 },
    priority: 50,
    pinned: false,
    visibility: {
      requiresConnection: null,
      requiresBridge: false,
      requiresPermission: null,
      hours: null,
      minimumWidth: null,
      hidden: false,
    },
    settings: { ...defaultsForSchema(options.schema), ...(options.settings ?? {}) },
    refreshSeconds: 0,
    shortcut: null,
  };

  return commit(
    document,
    [{ op: "insert", path: widgetsPath(options.pageId), index: page.widgets.length, value: node }],
    { label: options.label ?? `Add ${options.type}` },
  );
}

export function removeWidget(document: ConfigDocument, pageId: string, widgetId: string, label?: string) {
  const index = widgetIndex(document, pageId, widgetId);
  return commit(document, [{ op: "remove", path: widgetsPath(pageId), index }], {
    label: label ?? "Remove widget",
  });
}

export function duplicateWidget(document: ConfigDocument, pageId: string, widgetId: string) {
  const page = findPage(document, pageId)!;
  const index = widgetIndex(document, pageId, widgetId);
  const original = page.widgets[index]!;
  const copy: WidgetNode = {
    ...structuredClone(original),
    id: newWidgetId(original.type),
    order: original.order + 0.5,
    pinned: false,
  };
  return commit(document, [{ op: "insert", path: widgetsPath(pageId), index: index + 1, value: copy }], {
    label: "Duplicate widget",
  });
}

/** Drag-and-drop: change zone and slot between two neighbours in one transaction. */
export function moveWidget(
  document: ConfigDocument,
  options: { pageId: string; widgetId: string; toZoneId: string; beforeOrder: number | null; afterOrder: number | null },
) {
  const path = [...widgetsPath(options.pageId), { id: options.widgetId }] as Path;
  const operations: Operation[] = [
    { op: "set", path: [...path, "zone"], value: options.toZoneId },
    { op: "set", path: [...path, "order"], value: orderBetween(options.beforeOrder, options.afterOrder) },
  ];
  return commit(document, operations, { label: "Move widget" });
}

export function resizeWidget(
  document: ConfigDocument,
  pageId: string,
  widgetId: string,
  span: { columns: number; rows: number },
) {
  const path = [...widgetsPath(pageId), { id: widgetId }, "span"] as Path;
  const clamped = {
    columns: Math.max(1, Math.min(12, Math.round(span.columns))),
    rows: Math.max(1, Math.min(12, Math.round(span.rows))),
  };
  return commit(document, [{ op: "set", path, value: clamped }], { label: "Resize widget" });
}

export function setWidgetSetting(
  document: ConfigDocument,
  pageId: string,
  widgetId: string,
  settingKey: string,
  value: unknown,
) {
  const path = [...widgetsPath(pageId), { id: widgetId }, "settings", settingKey] as Path;
  return commit(document, [{ op: "set", path, value }], { label: `Change ${settingKey}` });
}

export function setWidgetVisibility(
  document: ConfigDocument,
  pageId: string,
  widgetId: string,
  patch: Partial<WidgetNode["visibility"]>,
) {
  const base = [...widgetsPath(pageId), { id: widgetId }, "visibility"] as Path;
  const operations: Operation[] = Object.entries(patch).map(([key, value]) => ({
    op: "set" as const,
    path: [...base, key],
    value,
  }));
  return commit(document, operations, { label: "Change when this appears" });
}

/** Puts one widget back to its defaults without touching anything else. */
export function resetWidget(
  document: ConfigDocument,
  pageId: string,
  widgetId: string,
  schema: PropertySchema,
) {
  const path = [...widgetsPath(pageId), { id: widgetId }, "settings"] as Path;
  return commit(document, [{ op: "set", path, value: defaultsForSchema(schema) }], {
    label: "Reset widget to defaults",
  });
}

export function setPreference<K extends keyof ConfigDocument["preferences"]>(
  document: ConfigDocument,
  key: K,
  value: ConfigDocument["preferences"][K],
) {
  return commit(document, [{ op: "set", path: ["preferences", key as string], value }], {
    label: `Change ${String(key)}`,
  });
}

export function setTheme(document: ConfigDocument, themeId: string) {
  return commit(document, [{ op: "set", path: ["themeId"], value: themeId }], { label: "Change theme" });
}

export function addPage(document: ConfigDocument, page: ConfigDocument["pages"][number]) {
  return commit(document, [{ op: "insert", path: ["pages"], index: document.pages.length, value: page }], {
    label: `Add page “${page.title}”`,
  });
}

export function removePage(document: ConfigDocument, pageId: string) {
  const index = document.pages.findIndex((page) => page.id === pageId);
  if (index === -1) {
    throw new OperationError("That page has already been removed.", "Reload to see the current pages.");
  }
  if (document.pages.length === 1) {
    throw new OperationError(
      "This is the only page, so it cannot be deleted.",
      "Create another page first, then delete this one.",
    );
  }
  return commit(document, [{ op: "remove", path: ["pages"], index }], { label: "Delete page" });
}

export function reorderDock(document: ConfigDocument, from: number, to: number) {
  return commit(document, [{ op: "move", path: ["dock"], from, to }], { label: "Reorder dock" });
}

/** Replaces the entire document — used by import and by "restore this version". */
export function replaceDocument(document: ConfigDocument, next: ConfigDocument, label: string) {
  const operations: Operation[] = (["pages", "workspaces", "dock", "topBar", "preferences", "themeId", "productName"] as const).map(
    (key) => ({ op: "set" as const, path: [key], value: next[key] }),
  );
  return commit(document, operations, { label });
}
