import {
  CONFIG_SCHEMA_VERSION,
  commit,
  configDocumentSchema,
  defaultsForSchema,
  defaultThemeId,
  type ConfigDocument,
  type Operation,
  type Page,
  type Path,
  type PropertySchema,
  type WidgetNode,
} from "@nexus/schemas";

/**
 * The gestures Studio needs that `packages/schemas/src/editor.ts` does not
 * already provide.
 *
 * Each one is a composition of the four primitive operations and goes through
 * `commit()`, so it inherits undo, redo, version history, draft/publish and the
 * audit trail for free. Nothing here mutates a document.
 */

const widgetPath = (pageId: string, widgetId: string): Path => [
  "pages",
  { id: pageId },
  "widgets",
  { id: widgetId },
];

/** Sets one field of a widget node — priority, pinned, refresh, shortcut, zone. */
export function setWidgetField<Field extends keyof WidgetNode>(
  document: ConfigDocument,
  pageId: string,
  widgetId: string,
  field: Field,
  value: WidgetNode[Field],
  label: string,
) {
  return commit(document, [{ op: "set", path: [...widgetPath(pageId, widgetId), field as string], value }], {
    label,
  });
}

/** Replaces a whole widget node. Used by the advanced JSON editor. */
export function replaceWidgetNode(
  document: ConfigDocument,
  pageId: string,
  widgetId: string,
  node: WidgetNode,
  label = "Edit widget JSON",
) {
  const page = document.pages.find((candidate) => candidate.id === pageId);
  const index = page?.widgets.findIndex((widget) => widget.id === widgetId) ?? -1;
  if (!page || index === -1) {
    throw Object.assign(new Error("That widget has already been removed."), {
      recovery: "Reload Nexus Studio to see the current layout.",
    });
  }
  return commit(document, [{ op: "set", path: ["pages", { id: pageId }, "widgets", index], value: node }], {
    label,
  });
}

/** Sets one field of a page — its title, icon or whether navigation lists it. */
export function setPageField<Field extends keyof Page>(
  document: ConfigDocument,
  pageId: string,
  field: Field,
  value: Page[Field],
  label: string,
) {
  return commit(document, [{ op: "set", path: ["pages", { id: pageId }, field as string], value }], { label });
}

/** A brand-new page. Zones match the shape the resolver and the shell expect. */
export function newPage(title: string): Page {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id: `${slug || "page"}-${Math.random().toString(36).slice(2, 7)}`,
    title: title.trim() || "New page",
    icon: "square.grid.2x2",
    showInNavigation: true,
    zones: [
      { id: "hero", label: "Featured", layout: "grid", collapsed: false },
      { id: "main", label: "Dashboard", layout: "grid", collapsed: false },
      { id: "rail", label: "Side rail", layout: "column", collapsed: false },
    ],
    widgets: [],
  };
}

/**
 * Puts every widget on one page back to the defaults its own schema declares.
 * One transaction, so a single undo restores the whole page.
 */
export function resetPage(
  document: ConfigDocument,
  pageId: string,
  schemaFor: (type: string) => PropertySchema | undefined,
) {
  const page = document.pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    throw Object.assign(new Error("That page no longer exists."), {
      recovery: "Choose a page from the tabs above.",
    });
  }
  const operations: Operation[] = page.widgets
    .map((widget) => {
      const schema = schemaFor(widget.type);
      if (!schema) return null;
      return {
        op: "set" as const,
        path: [...widgetPath(pageId, widget.id), "settings"],
        value: defaultsForSchema(schema),
      };
    })
    .filter((operation): operation is Operation => operation !== null);

  if (operations.length === 0) {
    throw Object.assign(new Error("There is nothing on this page to reset."), {
      recovery: "Add a widget first, then reset the page.",
    });
  }
  return commit(document, operations, { label: `Reset every widget on “${page.title}”` });
}

/** The appearance defaults, taken from the document schema rather than repeated. */
export function themeDefaults(): { themeId: string; preferences: ConfigDocument["preferences"] } {
  const blank = configDocumentSchema.parse({ schemaVersion: CONFIG_SCHEMA_VERSION });
  return { themeId: defaultThemeId, preferences: blank.preferences };
}

/** Returns the theme and every appearance preference to their shipped values. */
export function resetTheme(document: ConfigDocument) {
  const defaults = themeDefaults();
  const operations: Operation[] = [
    { op: "set", path: ["themeId"], value: defaults.themeId },
    { op: "set", path: ["preferences", "cornerRadius"], value: defaults.preferences.cornerRadius },
    { op: "set", path: ["preferences", "panelTransparency"], value: defaults.preferences.panelTransparency },
    { op: "set", path: ["preferences", "animationIntensity"], value: defaults.preferences.animationIntensity },
    { op: "set", path: ["preferences", "density"], value: defaults.preferences.density },
    { op: "set", path: ["preferences", "soundVolume"], value: defaults.preferences.soundVolume },
    { op: "set", path: ["preferences", "soundsEnabled"], value: defaults.preferences.soundsEnabled },
    { op: "set", path: ["preferences", "fontId"], value: defaults.preferences.fontId },
  ];
  return commit(document, operations, { label: "Reset appearance to the Nexus defaults" });
}

/** One appearance preference. Kept separate so each slider is its own undo step. */
export function setPreferenceField<Field extends keyof ConfigDocument["preferences"]>(
  document: ConfigDocument,
  field: Field,
  value: ConfigDocument["preferences"][Field],
  label: string,
) {
  return commit(document, [{ op: "set", path: ["preferences", field as string], value }], { label });
}

/** Applies a set of operations that were computed elsewhere, e.g. a restore. */
export function applyPrepared(document: ConfigDocument, operations: Operation[], label: string) {
  return commit(document, operations, { label });
}
