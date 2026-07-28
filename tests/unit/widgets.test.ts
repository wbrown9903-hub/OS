import { describe, expect, it } from "vitest";
import {
  defaultsForSchema,
  inspectorGroups,
  reconcileSettings,
  validatorForProperty,
  validatorForSchema,
  type PropertyDefinition,
  type PropertySchema,
} from "@nexus/schemas";
import { builtInWidgets, createWidgetRegistry } from "../../packages/widgets/src/index.js";

/**
 * These tests are the contract every widget file must keep. They are deliberately
 * structural: a new widget passes or fails without anyone remembering to add a
 * test for it.
 */

const KNOWN_CATEGORIES = new Set([
  "Essentials",
  "Games",
  "AI",
  "Commerce",
  "Knowledge",
  "System",
  "Automation",
  "Web",
  "Finance",
]);

/** Walks a widget's schema including the item schemas of every list property. */
function everyProperty(schema: PropertySchema): Array<{ path: string; definition: PropertyDefinition }> {
  const found: Array<{ path: string; definition: PropertyDefinition }> = [];
  for (const [key, definition] of Object.entries(schema)) {
    found.push({ path: key, definition });
    if (definition.kind === "list") {
      for (const nested of everyProperty(definition.itemSchema)) {
        found.push({ path: `${key}[].${nested.path}`, definition: nested.definition });
      }
    }
  }
  return found;
}

describe("built-in widget catalogue", () => {
  it("ships every promised category", () => {
    const categories = new Set(builtInWidgets.map((widget) => widget.category));
    for (const category of KNOWN_CATEGORIES) {
      expect(categories, `no widget in category ${category}`).toContain(category);
    }
  });

  it("registers without a duplicate type", () => {
    const types = builtInWidgets.map((widget) => widget.type);
    expect(new Set(types).size).toBe(types.length);
    expect(() => createWidgetRegistry()).not.toThrow();
  });

  it("uses a stable, namespaced identifier for every widget", () => {
    for (const widget of builtInWidgets) {
      expect(widget.type, `${widget.name} has an unnamespaced type`).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+$/);
    }
  });

  it.each(builtInWidgets.map((widget) => [widget.type, widget] as const))(
    "%s is complete and self-describing",
    (_type, widget) => {
      expect(widget.name.length).toBeGreaterThan(0);
      expect(widget.summary.length).toBeGreaterThan(10);
      expect(KNOWN_CATEGORIES.has(widget.category)).toBe(true);
      expect(widget.icon.length).toBeGreaterThan(0);
      expect(Object.keys(widget.schema).length).toBeGreaterThan(0);
    },
  );

  it.each(builtInWidgets.map((widget) => [widget.type, widget] as const))(
    "%s can never be resized to something unreadable",
    (_type, widget) => {
      expect(widget.minimumSpan.columns).toBeGreaterThanOrEqual(1);
      expect(widget.minimumSpan.rows).toBeGreaterThanOrEqual(1);
      expect(widget.minimumSpan.columns).toBeLessThanOrEqual(widget.defaultSpan.columns);
      expect(widget.minimumSpan.rows).toBeLessThanOrEqual(widget.defaultSpan.rows);
      expect(widget.defaultSpan.columns).toBeLessThanOrEqual(12);
      expect(widget.defaultSpan.rows).toBeLessThanOrEqual(12);
    },
  );

  it.each(builtInWidgets.map((widget) => [widget.type, widget] as const))(
    "%s explains every property in plain language",
    (_type, widget) => {
      for (const { path, definition } of everyProperty(widget.schema)) {
        expect(definition.label.length, `${path} has no label`).toBeGreaterThan(0);
        expect(definition.help.length, `${path} has no help text`).toBeGreaterThan(15);
        expect(definition.defaultValue, `${path} has no default`).toBeDefined();
      }
    },
  );

  it.each(builtInWidgets.map((widget) => [widget.type, widget] as const))(
    "%s has defaults that satisfy its own derived validator",
    (_type, widget) => {
      for (const { path, definition } of everyProperty(widget.schema)) {
        const result = validatorForProperty(definition).safeParse(definition.defaultValue);
        expect(result.success, `${path}: ${result.success ? "" : result.error.message}`).toBe(true);
      }
      const parsed = validatorForSchema(widget.schema).safeParse(defaultsForSchema(widget.schema));
      expect(parsed.success).toBe(true);
    },
  );

  it.each(builtInWidgets.map((widget) => [widget.type, widget] as const))(
    "%s survives a partial or corrupted stored settings object",
    (_type, widget) => {
      const { settings, repaired } = reconcileSettings(widget.schema, { nonsense: 42 });
      expect(Object.keys(settings).sort()).toEqual(Object.keys(widget.schema).sort());
      expect(repaired.some((message) => message.includes("nonsense"))).toBe(true);
    },
  );

  it.each(builtInWidgets.map((widget) => [widget.type, widget] as const))(
    "%s groups into inspector sections and hides advanced fields for beginners",
    (_type, widget) => {
      const standard = inspectorGroups(widget.schema, "standard");
      expect(standard.length).toBeGreaterThan(0);
      const beginnerKeys = inspectorGroups(widget.schema, "beginner").flatMap((group) =>
        group.properties.map((property) => property.key),
      );
      for (const [key, definition] of Object.entries(widget.schema)) {
        if (definition.advanced) expect(beginnerKeys).not.toContain(key);
      }
    },
  );

  it.each(builtInWidgets.map((widget) => [widget.type, widget] as const))(
    "%s declares a refresh cadence only where it has an endpoint to refresh from",
    (_type, widget) => {
      if (widget.defaultRefreshSeconds && widget.defaultRefreshSeconds > 0) {
        expect(widget.dataEndpoint, `${widget.type} refreshes but has no endpoint`).toBeDefined();
      }
      if (widget.dataEndpoint) expect(widget.dataEndpoint.startsWith("/api/")).toBe(true);
    },
  );

  it("never offers a free-form command as a default action", () => {
    for (const widget of builtInWidgets) {
      for (const { path, definition } of everyProperty(widget.schema)) {
        if (definition.kind !== "action") continue;
        expect(
          (definition.defaultValue as { type: string }).type,
          `${widget.type}.${path} defaults to running a command`,
        ).not.toBe("runCommand");
      }
    }
  });

  it("gives every image property a bundled fallback and an alt-text field", () => {
    for (const widget of builtInWidgets) {
      for (const { definition } of everyProperty(widget.schema)) {
        if (definition.kind !== "image") continue;
        const value = definition.defaultValue;
        expect(value.builtInId.length).toBeGreaterThan(0);
        expect(typeof value.altText).toBe("string");
      }
    }
  });

  it("never asks for a seed phrase or a private key anywhere in the catalogue", () => {
    const forbidden = /seed\s?phrase|private\s?key|mnemonic|keystore|secret\s?key/i;
    for (const widget of builtInWidgets) {
      for (const { path, definition } of everyProperty(widget.schema)) {
        const label = `${widget.type}.${path}`;
        expect(forbidden.test(definition.label), `${label} label`).toBe(false);
        // Help text may warn *against* entering one, but must not request it.
        expect(/enter (your )?(seed|private key)/i.test(definition.help), `${label} help`).toBe(false);
      }
    }
  });

  it("explains unavailability for every widget that depends on something", () => {
    const registry = createWidgetRegistry();
    for (const widget of registry.all()) {
      if (widget.requiresConnection) expect(widget.requiresConnection).toMatch(/^[a-z][a-z0-9-]*$/);
      if (widget.requiresPermission) expect(widget.requiresPermission).toMatch(/^[a-z][a-zA-Z]*$/);
      // Anything gated must tell the person what they gain by ungating it.
      if (widget.requiresConnection || widget.requiresBridge || widget.requiresPermission) {
        expect(widget.previewHint, `${widget.type} is gated but has no preview hint`).toBeTruthy();
      }
    }
  });

  it("groups the gallery in a stable order and searches by name, summary and type", () => {
    const registry = createWidgetRegistry();
    const grouped = registry.byCategory();
    expect(grouped[0]?.category).toBe("Essentials");
    expect(registry.search("runescape").map((widget) => widget.type)).toContain("runescape.hero");
    expect(registry.search("shopify").length).toBeGreaterThanOrEqual(5);
    expect(registry.search("")).toHaveLength(builtInWidgets.length);
  });

  it("ships the RuneScape banner with every promised editable property", () => {
    const hero = createWidgetRegistry().require("runescape.hero");
    expect(Object.keys(hero.schema)).toEqual(
      expect.arrayContaining([
        "title",
        "subtitle",
        "banner",
        "overlayStrength",
        "primaryAction",
        "secondaryAction",
        "game",
      ]),
    );
    const game = hero.schema.game;
    expect(game?.kind).toBe("select");
    if (game?.kind === "select") {
      expect(game.options.map((option) => option.value)).toEqual(["osrs", "rs3", "both"]);
    }
    const banner = hero.schema.banner;
    expect(banner?.kind).toBe("image");
    if (banner?.kind === "image") {
      // All four sourcing modes come from the shared image value, not per widget.
      expect(validatorForProperty(banner).safeParse({ ...banner.defaultValue, mode: "officialFeed" }).success).toBe(true);
      expect(validatorForProperty(banner).safeParse({ ...banner.defaultValue, mode: "nonsense" }).success).toBe(false);
    }
  });
});
