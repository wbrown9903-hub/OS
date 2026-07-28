import { describe, expect, it } from "vitest";
import {
  CONFIG_SCHEMA_VERSION,
  type ConfigDocument,
  type PropertySchema,
  addWidget,
  breakpointFor,
  commit,
  configDocumentSchema,
  contrastRatio,
  defaultResolveContext,
  defaultsForSchema,
  duplicateWidget,
  emptyHistory,
  evaluateAvailability,
  findWidget,
  inspectorGroups,
  isPropertyVisible,
  meetsContrastAA,
  moveWidget,
  orderBetween,
  pushHistory,
  reconcileSettings,
  redo,
  removeWidget,
  resetWidget,
  resizeWidget,
  resolvePage,
  scaleSpan,
  setPreference,
  setWidgetSetting,
  themeById,
  themes,
  undo,
  validatorForSchema,
} from "@nexus/schemas";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const demoSchema: PropertySchema = {
  title: { kind: "text", label: "Title", help: "Heading shown on the card.", defaultValue: "RuneScape", group: "Content" },
  subtitle: { kind: "text", label: "Subtitle", help: "Smaller line under the title.", defaultValue: "", group: "Content" },
  overlay: { kind: "slider", label: "Overlay", help: "Darkening over the image.", defaultValue: 0.45, min: 0, max: 1, group: "Appearance" },
  autoRefresh: { kind: "toggle", label: "Update automatically", help: "Fetch the newest banner.", defaultValue: true, group: "Behaviour" },
  feed: {
    kind: "select",
    label: "Game",
    help: "Which news source to read.",
    defaultValue: "osrs",
    options: [
      { value: "osrs", label: "Old School RuneScape" },
      { value: "rs3", label: "RuneScape" },
    ],
    group: "Data",
    visibleWhen: { property: "autoRefresh", equals: true },
  },
  debugMode: { kind: "toggle", label: "Show raw response", help: "For troubleshooting.", defaultValue: false, group: "Advanced", advanced: true },
};

function makeDocument(): ConfigDocument {
  return configDocumentSchema.parse({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    pages: [
      {
        id: "home",
        title: "Home",
        zones: [
          { id: "hero", label: "Hero", layout: "grid" },
          { id: "main", label: "Main", layout: "grid" },
        ],
        widgets: [],
      },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Property schema derivation                                                  */
/* -------------------------------------------------------------------------- */

describe("property schema derivation", () => {
  it("derives defaults for every declared property", () => {
    const defaults = defaultsForSchema(demoSchema);
    expect(defaults).toMatchObject({ title: "RuneScape", overlay: 0.45, autoRefresh: true, feed: "osrs" });
  });

  it("derives a validator that accepts defaults and rejects bad values", () => {
    const validator = validatorForSchema(demoSchema);
    expect(validator.safeParse(defaultsForSchema(demoSchema)).success).toBe(true);
    expect(validator.safeParse({ ...defaultsForSchema(demoSchema), overlay: 4 }).success).toBe(false);
    expect(validator.safeParse({ ...defaultsForSchema(demoSchema), feed: "wow" }).success).toBe(false);
  });

  it("fills a partial settings object rather than letting a widget crash", () => {
    const { settings, repaired } = reconcileSettings(demoSchema, { title: "Adventure" });
    expect(settings.title).toBe("Adventure");
    expect(settings.overlay).toBe(0.45);
    expect(repaired.some((note) => note.includes("subtitle"))).toBe(true);
  });

  it("replaces invalid stored values with defaults and reports each repair", () => {
    const { settings, repaired } = reconcileSettings(demoSchema, { overlay: "not a number", extra: 1 });
    expect(settings.overlay).toBe(0.45);
    expect(repaired.some((note) => note.includes("overlay"))).toBe(true);
    expect(repaired.some((note) => note.includes("no longer used"))).toBe(true);
  });

  it("derives inspector sections in a stable order and hides advanced fields for beginners", () => {
    const groups = inspectorGroups(demoSchema);
    expect(groups.map((group) => group.group)).toEqual(["Content", "Appearance", "Behaviour", "Data", "Advanced"]);

    const beginner = inspectorGroups(demoSchema, "beginner");
    expect(beginner.some((group) => group.group === "Advanced")).toBe(false);
  });

  it("honours conditional field visibility", () => {
    expect(isPropertyVisible(demoSchema.feed!, { autoRefresh: true })).toBe(true);
    expect(isPropertyVisible(demoSchema.feed!, { autoRefresh: false })).toBe(false);
    expect(isPropertyVisible(demoSchema.title!, {})).toBe(true);
  });

  it("rejects colours that are neither hex nor a theme token", () => {
    const schema: PropertySchema = {
      tint: { kind: "color", label: "Tint", help: "", defaultValue: "#101010" },
    };
    const validator = validatorForSchema(schema);
    expect(validator.safeParse({ tint: "#1B2A4A" }).success).toBe(true);
    expect(validator.safeParse({ tint: "token:accent" }).success).toBe(true);
    expect(validator.safeParse({ tint: "javascript:alert(1)" }).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Operations, undo/redo, history                                              */
/* -------------------------------------------------------------------------- */

describe("operations", () => {
  it("never mutates the document it is given", () => {
    const document = makeDocument();
    const snapshot = structuredClone(document);
    addWidget(document, { pageId: "home", type: "runescape.hero", schema: demoSchema });
    expect(document).toEqual(snapshot);
  });

  it("adds a widget with complete settings and bumps the revision", () => {
    const document = makeDocument();
    const result = addWidget(document, { pageId: "home", type: "runescape.hero", schema: demoSchema, zoneId: "hero" });
    const widget = result.document.pages[0]!.widgets[0]!;
    expect(widget.type).toBe("runescape.hero");
    expect(widget.zone).toBe("hero");
    expect(widget.settings.title).toBe("RuneScape");
    expect(result.document.revision).toBe(document.revision + 1);
  });

  it("computes an inverse that restores the exact previous state", () => {
    const base = makeDocument();
    const added = addWidget(base, { pageId: "home", type: "runescape.hero", schema: demoSchema }).document;
    const widgetId = added.pages[0]!.widgets[0]!.id;

    const changed = setWidgetSetting(added, "home", widgetId, "title", "Old School");
    expect(findWidget(changed.document, "home", widgetId)!.settings.title).toBe("Old School");

    const history = pushHistory(emptyHistory, changed.transaction);
    const undone = undo(changed.document, history);
    expect(findWidget(undone.document, "home", widgetId)!.settings.title).toBe("RuneScape");

    const redone = redo(undone.document, undone.history);
    expect(findWidget(redone.document, "home", widgetId)!.settings.title).toBe("Old School");
  });

  it("undoes a removal by restoring the widget at its original position", () => {
    let document = makeDocument();
    document = addWidget(document, { pageId: "home", type: "a", schema: demoSchema }).document;
    document = addWidget(document, { pageId: "home", type: "b", schema: demoSchema }).document;
    const firstId = document.pages[0]!.widgets[0]!.id;

    const removed = removeWidget(document, "home", firstId);
    expect(removed.document.pages[0]!.widgets).toHaveLength(1);

    const restored = undo(removed.document, pushHistory(emptyHistory, removed.transaction));
    expect(restored.document.pages[0]!.widgets).toHaveLength(2);
    expect(restored.document.pages[0]!.widgets[0]!.id).toBe(firstId);
  });

  it("applies a transaction all-or-nothing", () => {
    const document = makeDocument();
    expect(() =>
      commit(
        document,
        [
          { op: "set", path: ["themeId"], value: "arcane-gold" },
          { op: "set", path: ["pages", { id: "does-not-exist" }, "title"], value: "x" },
        ],
        { label: "Two changes" },
      ),
    ).toThrow();
    expect(document.themeId).toBe("nexus-obsidian");
  });

  it("gives a plain-language error with a recovery step when a target is gone", () => {
    const document = makeDocument();
    try {
      removeWidget(document, "home", "missing-widget");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("already been removed");
      expect((error as { recovery: string }).recovery).toContain("Reload");
    }
  });

  it("duplicates a widget without copying its identity or pin state", () => {
    let document = makeDocument();
    document = addWidget(document, { pageId: "home", type: "runescape.hero", schema: demoSchema }).document;
    const original = document.pages[0]!.widgets[0]!;
    const duplicated = duplicateWidget(document, "home", original.id).document;
    const copy = duplicated.pages[0]!.widgets[1]!;
    expect(copy.id).not.toBe(original.id);
    expect(copy.type).toBe(original.type);
    expect(copy.pinned).toBe(false);
  });

  it("moves a widget between zones and slots it between neighbours", () => {
    let document = makeDocument();
    document = addWidget(document, { pageId: "home", type: "a", schema: demoSchema, zoneId: "main" }).document;
    const widgetId = document.pages[0]!.widgets[0]!.id;
    const moved = moveWidget(document, {
      pageId: "home",
      widgetId,
      toZoneId: "hero",
      beforeOrder: 0,
      afterOrder: 1,
    }).document;
    const widget = findWidget(moved, "home", widgetId)!;
    expect(widget.zone).toBe("hero");
    expect(widget.order).toBe(0.5);
  });

  it("clamps resizes into the supported range", () => {
    let document = makeDocument();
    document = addWidget(document, { pageId: "home", type: "a", schema: demoSchema }).document;
    const widgetId = document.pages[0]!.widgets[0]!.id;
    const resized = resizeWidget(document, "home", widgetId, { columns: 99, rows: 0 }).document;
    expect(findWidget(resized, "home", widgetId)!.span).toEqual({ columns: 12, rows: 1 });
  });

  it("resets one widget without touching its neighbours", () => {
    let document = makeDocument();
    document = addWidget(document, { pageId: "home", type: "a", schema: demoSchema }).document;
    document = addWidget(document, { pageId: "home", type: "b", schema: demoSchema }).document;
    const [first, second] = document.pages[0]!.widgets;
    document = setWidgetSetting(document, "home", first!.id, "title", "Changed").document;
    document = setWidgetSetting(document, "home", second!.id, "title", "Keep me").document;

    const reset = resetWidget(document, "home", first!.id, demoSchema).document;
    expect(findWidget(reset, "home", first!.id)!.settings.title).toBe("RuneScape");
    expect(findWidget(reset, "home", second!.id)!.settings.title).toBe("Keep me");
  });

  it("keeps undo and redo consistent across a long editing session", () => {
    let document = makeDocument();
    let history = emptyHistory;
    const titles = ["one", "two", "three", "four"];

    document = addWidget(document, { pageId: "home", type: "a", schema: demoSchema }).document;
    const widgetId = document.pages[0]!.widgets[0]!.id;

    for (const title of titles) {
      const result = setWidgetSetting(document, "home", widgetId, "title", title);
      document = result.document;
      history = pushHistory(history, result.transaction);
    }
    expect(findWidget(document, "home", widgetId)!.settings.title).toBe("four");

    for (const expected of ["three", "two", "one", "RuneScape"]) {
      const result = undo(document, history);
      document = result.document;
      history = result.history;
      expect(findWidget(document, "home", widgetId)!.settings.title).toBe(expected);
    }

    for (const expected of ["one", "two", "three", "four"]) {
      const result = redo(document, history);
      document = result.document;
      history = result.history;
      expect(findWidget(document, "home", widgetId)!.settings.title).toBe(expected);
    }
  });

  it("discards the redo branch once a new edit is made", () => {
    let document = makeDocument();
    document = addWidget(document, { pageId: "home", type: "a", schema: demoSchema }).document;
    const widgetId = document.pages[0]!.widgets[0]!.id;

    const first = setWidgetSetting(document, "home", widgetId, "title", "A");
    let history = pushHistory(emptyHistory, first.transaction);
    const undone = undo(first.document, history);
    expect(undone.history.future).toHaveLength(1);

    const second = setWidgetSetting(undone.document, "home", widgetId, "title", "B");
    history = pushHistory(undone.history, second.transaction);
    expect(history.future).toHaveLength(0);
  });

  it("changes a preference through the same transaction mechanism", () => {
    const document = makeDocument();
    const result = setPreference(document, "soundVolume", 0.2);
    expect(result.document.preferences.soundVolume).toBe(0.2);
    expect(result.transaction.inverse[0]).toMatchObject({ op: "set", value: 0.5 });
  });

  it("places fractional orders between neighbours for drag-and-drop", () => {
    expect(orderBetween(1, 2)).toBe(1.5);
    expect(orderBetween(null, 5)).toBe(4);
    expect(orderBetween(3, null)).toBe(4);
    expect(orderBetween(null, null)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Resolver                                                                    */
/* -------------------------------------------------------------------------- */

describe("layout resolver", () => {
  it("chooses a breakpoint and column count from the viewport", () => {
    expect(breakpointFor(600)).toBe("compact");
    expect(breakpointFor(900)).toBe("medium");
    expect(breakpointFor(1440)).toBe("regular");
    expect(breakpointFor(2560)).toBe("wide");
  });

  it("scales a 12-column intent onto the display's real columns", () => {
    expect(scaleSpan(12, 12)).toBe(12);
    expect(scaleSpan(6, 4)).toBe(2);
    expect(scaleSpan(1, 4)).toBe(1);
    expect(scaleSpan(12, 16)).toBe(16);
  });

  it("lays out one stored layout correctly on a phone and on a 5K display", () => {
    let document = makeDocument();
    document = addWidget(document, {
      pageId: "home",
      type: "a",
      schema: demoSchema,
      zoneId: "main",
      span: { columns: 6, rows: 2 },
    }).document;

    const narrow = resolvePage(document, document.pages[0]!, defaultResolveContext({ viewportWidth: 500 }));
    const wide = resolvePage(document, document.pages[0]!, defaultResolveContext({ viewportWidth: 2560 }));

    expect(narrow.columns).toBe(4);
    expect(narrow.zones[1]!.widgets[0]!.columns).toBe(2);
    expect(wide.columns).toBe(16);
    expect(wide.zones[1]!.widgets[0]!.columns).toBe(8);
  });

  it("explains an unavailable widget instead of letting it vanish", () => {
    const widget = {
      visibility: { requiresConnection: "shopify", requiresBridge: false, requiresPermission: null, hours: null, minimumWidth: null, hidden: false },
      type: "shopify.salesToday",
    } as never;

    const reason = evaluateAvailability(widget, defaultResolveContext({ connections: { shopify: "notConfigured" } }));
    expect(reason).not.toBeNull();
    expect(reason!.kind).toBe("connection");
    expect(reason!.nextStep.length).toBeGreaterThan(0);
    expect(reason!.resolveHref).toBe("/settings/connections/shopify");

    const connected = evaluateAvailability(widget, defaultResolveContext({ connections: { shopify: "connected" } }));
    expect(connected).toBeNull();
  });

  it("explains a missing Mac Bridge and a missing macOS permission", () => {
    const bridgeWidget = {
      visibility: { requiresConnection: null, requiresBridge: true, requiresPermission: null, hours: null, minimumWidth: null, hidden: false },
      type: "launcher.app",
    } as never;
    expect(evaluateAvailability(bridgeWidget, defaultResolveContext({ bridgeAvailable: false }))!.kind).toBe("bridge");
    expect(evaluateAvailability(bridgeWidget, defaultResolveContext({ bridgeAvailable: true }))).toBeNull();

    const permissionWidget = {
      visibility: { requiresConnection: null, requiresBridge: false, requiresPermission: "accessibility", hours: null, minimumWidth: null, hidden: false },
      type: "windows.tile",
    } as never;
    const denied = evaluateAvailability(permissionWidget, defaultResolveContext({ permissions: { accessibility: "denied" } }));
    expect(denied!.kind).toBe("permission");
    expect(denied!.nextStep).toContain("System Settings");
  });

  it("honours scheduled hours including ranges that wrap past midnight", () => {
    const widget = {
      visibility: { requiresConnection: null, requiresBridge: false, requiresPermission: null, hours: { from: 22, to: 7 }, minimumWidth: null, hidden: false },
      type: "focus.timer",
    } as never;
    const atMidnight = new Date("2026-01-01T00:30:00");
    const atNoon = new Date("2026-01-01T12:00:00");
    expect(evaluateAvailability(widget, defaultResolveContext({ now: atMidnight }))).toBeNull();
    expect(evaluateAvailability(widget, defaultResolveContext({ now: atNoon }))!.kind).toBe("schedule");
  });

  it("hides extension widgets in Safe Mode with an explanation", () => {
    const widget = {
      visibility: { requiresConnection: null, requiresBridge: false, requiresPermission: null, hours: null, minimumWidth: null, hidden: false },
      type: "plugin.acme.counter",
    } as never;
    expect(evaluateAvailability(widget, defaultResolveContext({ recoveryMode: true }))!.kind).toBe("recovery");
  });

  it("pins pinned widgets ahead of ordinary ones", () => {
    let document = makeDocument();
    document = addWidget(document, { pageId: "home", type: "a", schema: demoSchema, zoneId: "main" }).document;
    document = addWidget(document, { pageId: "home", type: "b", schema: demoSchema, zoneId: "main" }).document;
    const secondId = document.pages[0]!.widgets[1]!.id;
    document = commit(document, [{ op: "set", path: ["pages", { id: "home" }, "widgets", { id: secondId }, "pinned"], value: true }], { label: "Pin" }).document;

    const resolved = resolvePage(document, document.pages[0]!, defaultResolveContext());
    expect(resolved.zones[1]!.widgets[0]!.node.id).toBe(secondId);
  });

  it("omits widgets the user hid, and those below their minimum width", () => {
    let document = makeDocument();
    document = addWidget(document, { pageId: "home", type: "a", schema: demoSchema, zoneId: "main" }).document;
    const widgetId = document.pages[0]!.widgets[0]!.id;
    document = commit(
      document,
      [{ op: "set", path: ["pages", { id: "home" }, "widgets", { id: widgetId }, "visibility", "minimumWidth"], value: 1200 }],
      { label: "Set minimum width" },
    ).document;

    const narrow = resolvePage(document, document.pages[0]!, defaultResolveContext({ viewportWidth: 800 }));
    const wide = resolvePage(document, document.pages[0]!, defaultResolveContext({ viewportWidth: 1600 }));
    expect(narrow.zones[1]!.widgets).toHaveLength(0);
    expect(wide.zones[1]!.widgets).toHaveLength(1);
  });

  it("pins animation to zero under reduced motion, whatever the user's slider says", () => {
    const document = makeDocument();
    const context = defaultResolveContext({
      accessibility: { reducedMotion: true, reducedTransparency: false, highContrast: false, fontScale: 1 },
    });
    const resolved = resolvePage(document, document.pages[0]!, context);
    expect(resolved.animationScale).toBe(0);
    expect(resolved.styleVariables["--nx-animation-scale"]).toBe("0.000");
  });

  it("halves animation in low power mode", () => {
    const document = makeDocument();
    const resolved = resolvePage(
      document,
      document.pages[0]!,
      defaultResolveContext({ power: { lowPowerMode: true, charging: false } }),
    );
    expect(resolved.animationScale).toBeCloseTo(0.4, 5);
  });

  it("makes panels fully opaque under reduced transparency or high contrast", () => {
    const document = makeDocument();
    for (const accessibility of [
      { reducedMotion: false, reducedTransparency: true, highContrast: false, fontScale: 1 },
      { reducedMotion: false, reducedTransparency: false, highContrast: true, fontScale: 1 },
    ]) {
      const resolved = resolvePage(document, document.pages[0]!, defaultResolveContext({ accessibility }));
      expect(resolved.styleVariables["--nx-panel-opacity"]).toBe("1.000");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Themes                                                                      */
/* -------------------------------------------------------------------------- */

describe("themes", () => {
  it("ships the six built-in themes with unique identifiers", () => {
    expect(themes).toHaveLength(6);
    expect(new Set(themes.map((theme) => theme.id)).size).toBe(6);
    for (const id of ["nexus-obsidian", "arcane-gold", "clean-studio", "cyber-command", "minimal-productivity", "high-contrast"]) {
      expect(themeById(id).id).toBe(id);
    }
  });

  it("falls back to the default theme rather than failing on an unknown id", () => {
    expect(themeById("does-not-exist").id).toBe("nexus-obsidian");
  });

  it("meets WCAG AA for primary text on every built-in theme", () => {
    for (const theme of themes) {
      const ratio = contrastRatio(theme.tokens.textPrimary, theme.tokens.canvas);
      expect(ratio, `${theme.name} primary text`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("meets WCAG AA for secondary text on every built-in theme", () => {
    for (const theme of themes) {
      const ratio = contrastRatio(theme.tokens.textSecondary, theme.tokens.canvas);
      expect(ratio, `${theme.name} secondary text`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("computes contrast ratios correctly at the extremes", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#000000", "#000000")).toBeCloseTo(1, 5);
    expect(meetsContrastAA("#FFFFFF", "#000000")).toBe(true);
    expect(meetsContrastAA("#777777", "#808080")).toBe(false);
  });
});
