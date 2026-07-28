import {
  actionSchema,
  audioSourceSchema,
  configDocumentSchema,
  contrastRatio,
  imageSourceSchema,
  linkSchema,
  meetsContrastAA,
  orderBetween,
  themeById,
  type ActionValue,
  type AudioSourceValue,
  type ConfigDocument,
  type ImageSourceValue,
  type LinkValue,
  type Operation,
  type PropertyDefinition,
  type Theme,
  type ThemeTokens,
  type WidgetDefinition,
  type WidgetNode,
} from "@nexus/schemas";

/**
 * Nexus Studio — the pure part.
 *
 * Everything in this file is a plain function over plain values: no React, no
 * DOM, no fetch. The editor's rules therefore have unit tests
 * (`tests/unit/studio.test.ts`) instead of only being exercised by clicking.
 *
 * Nothing here knows what a widget *is*. Studio derives every control from the
 * property schema, so adding a widget type never changes a line of this file.
 */

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

/** The document's experience level, mapped onto the inspector's three modes. */
export function experienceMode(
  level: ConfigDocument["preferences"]["experienceLevel"],
): "beginner" | "standard" | "advanced" {
  if (level === "beginner") return "beginner";
  if (level === "advanced" || level === "developer") return "advanced";
  return "standard";
}

/* -------------------------------------------------------------------------- */
/* Reading stored settings safely                                              */
/* -------------------------------------------------------------------------- */

/**
 * Settings arrive as `unknown` — they may come from an older document, a partial
 * import or a hand-edited JSON blob. Every control reads its value through one of
 * these, so a bad value shows the default instead of crashing the inspector.
 */

export function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) =>
    entry !== null && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : {},
  );
}

export const emptyImageValue = (): ImageSourceValue => ({
  mode: "builtIn",
  builtInId: "nexus-abstract-01",
  uploadPath: null,
  remoteURL: null,
  feedId: null,
  altText: "",
  attribution: null,
});

export function readImage(value: unknown): ImageSourceValue {
  const parsed = imageSourceSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyImageValue();
}

export const emptyAudioValue = (): AudioSourceValue => ({
  mode: "builtIn",
  builtInId: "nexus-chime",
  uploadPath: null,
  volume: 0.6,
});

export function readAudio(value: unknown): AudioSourceValue {
  const parsed = audioSourceSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyAudioValue();
}

export const emptyLinkValue = (): LinkValue => ({ url: "", label: "", openIn: "browser" });

export function readLink(value: unknown): LinkValue {
  const parsed = linkSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyLinkValue();
}

export const emptyActionValue = (): ActionValue => ({
  type: "none",
  target: "",
  parameters: {},
  confirmationRequired: false,
  fallbackURL: null,
});

export function readAction(value: unknown): ActionValue {
  const parsed = actionSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyActionValue();
}

/* -------------------------------------------------------------------------- */
/* The 12-column intent grid                                                   */
/* -------------------------------------------------------------------------- */

export const INTENT_COLUMNS = 12;

/**
 * Turns a dragged pixel width into a span in the stored 12-column intent grid.
 *
 * The canvas may be drawn with 4, 8, 12 or 16 columns depending on the display,
 * so the pointer is first snapped to the columns actually on screen and only then
 * converted back into intent. That is why a resize made on a wide display still
 * means the same thing on a laptop.
 */
export function snapSpanColumns(widthPx: number, containerWidth: number, resolvedColumns: number): number {
  if (containerWidth <= 0 || resolvedColumns <= 0) return 1;
  const unit = containerWidth / resolvedColumns;
  const resolved = clamp(Math.round(widthPx / unit), 1, resolvedColumns);
  return clamp(Math.round((resolved / resolvedColumns) * INTENT_COLUMNS), 1, INTENT_COLUMNS);
}

/** Turns a dragged pixel height into a row span, accounting for the grid gap. */
export function snapSpanRows(heightPx: number, rowHeightPx: number, gapPx: number): number {
  if (rowHeightPx <= 0) return 1;
  return clamp(Math.round((heightPx + gapPx) / (rowHeightPx + gapPx)), 1, 12);
}

/** Pixel width of a span, used to draw the live size readout while dragging. */
export function widthForSpan(columns: number, containerWidth: number, resolvedColumns: number): number {
  if (resolvedColumns <= 0) return containerWidth;
  const resolved = clamp(Math.round((columns / INTENT_COLUMNS) * resolvedColumns), 1, resolvedColumns);
  return (containerWidth / resolvedColumns) * resolved;
}

/* -------------------------------------------------------------------------- */
/* Drag to reorder                                                             */
/* -------------------------------------------------------------------------- */

export interface DropSlot {
  /** Order value the moved widget should take. */
  order: number;
  beforeOrder: number | null;
  afterOrder: number | null;
}

/**
 * Works out the fractional order a widget needs to land in slot `index` of a
 * zone. Fractional orders are what let a drop happen without renumbering — and
 * therefore without touching every other widget in the same transaction.
 */
export function dropSlotFor(neighbourOrders: number[], index: number): DropSlot {
  const sorted = [...neighbourOrders].sort((a, b) => a - b);
  const position = clamp(index, 0, sorted.length);
  const before = position > 0 ? sorted[position - 1]! : null;
  const after = position < sorted.length ? sorted[position]! : null;
  return { order: orderBetween(before, after), beforeOrder: before, afterOrder: after };
}

/** The widgets of one zone, in the order the resolver would draw them. */
export function widgetsInZone(widgets: WidgetNode[], zoneId: string): WidgetNode[] {
  return widgets
    .filter((widget) => widget.zone === zoneId)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.order !== b.order) return a.order - b.order;
      return a.priority - b.priority;
    });
}

/** Where a keyboard "move earlier/later" lands, expressed as a drop slot. */
export function nudgeSlot(
  widgets: WidgetNode[],
  zoneId: string,
  widgetId: string,
  direction: -1 | 1,
): DropSlot | null {
  const inZone = widgetsInZone(widgets, zoneId);
  const currentIndex = inZone.findIndex((widget) => widget.id === widgetId);
  if (currentIndex === -1) return null;
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= inZone.length) return null;
  const others = inZone.filter((widget) => widget.id !== widgetId).map((widget) => widget.order);
  return dropSlotFor(others, targetIndex);
}

/* -------------------------------------------------------------------------- */
/* Version history                                                             */
/* -------------------------------------------------------------------------- */

export interface HistoryEntry {
  id: string;
  label: string;
  author: string;
  revision: number;
  createdAt: string;
  operations: Operation[];
  inverse: Operation[];
}

/**
 * Restoring a version is not a special mechanism: it is the inverses of every
 * edit made since that version, newest first, applied as one ordinary
 * transaction — which means the restore itself can be undone.
 */
export function buildRestoreOperations(entries: HistoryEntry[], targetRevision: number): Operation[] {
  return [...entries]
    .filter((entry) => entry.revision > targetRevision)
    .sort((a, b) => b.revision - a.revision)
    .flatMap((entry) => entry.inverse);
}

/** Parses the history payload defensively — a bad row is skipped, never fatal. */
export function readHistoryEntries(payload: unknown): HistoryEntry[] {
  if (!payload || typeof payload !== "object") return [];
  const list = (payload as { transactions?: unknown }).transactions;
  if (!Array.isArray(list)) return [];
  const entries: HistoryEntry[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.revision !== "number") continue;
    entries.push({
      id: record.id,
      label: readString(record.label, "Edit"),
      author: readString(record.author, "user"),
      revision: record.revision,
      createdAt: readString(record.createdAt, ""),
      operations: Array.isArray(record.operations) ? (record.operations as Operation[]) : [],
      inverse: Array.isArray(record.inverse) ? (record.inverse as Operation[]) : [],
    });
  }
  return entries.sort((a, b) => b.revision - a.revision);
}

/* -------------------------------------------------------------------------- */
/* Import and export                                                           */
/* -------------------------------------------------------------------------- */

export type ImportResult =
  | { ok: true; document: ConfigDocument; widgetCount: number }
  | { ok: false; message: string; nextStep: string; unknownTypes: string[] };

/** Every widget type used anywhere in a document. */
export function widgetTypesIn(document: ConfigDocument): string[] {
  const types = new Set<string>();
  for (const page of document.pages) for (const widget of page.widgets) types.add(widget.type);
  return [...types].sort();
}

/**
 * Imports are `external` provenance: they are validated the same way an API
 * payload is, and a layout naming a widget this build does not have is refused
 * with the list of names rather than silently dropping panels.
 */
export function validateImport(text: string, knownTypes: ReadonlySet<string>): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      message: "That file is not valid JSON, so Nexus OS could not read it.",
      nextStep: "Export a layout from Nexus Studio to see the expected shape, then try again.",
      unknownTypes: [],
    };
  }

  // Exports wrap the document so the file can carry its own version note.
  const candidate =
    raw && typeof raw === "object" && "document" in (raw as Record<string, unknown>)
      ? (raw as { document: unknown }).document
      : raw;

  const parsed = configDocumentSchema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first && first.path.length > 0 ? ` (at ${first.path.join(".")})` : "";
    return {
      ok: false,
      message: `That file is not a Nexus OS layout${where}.`,
      nextStep: first
        ? `${first.message}. Export a layout from Nexus Studio to see the expected shape.`
        : "Export a layout from Nexus Studio to see the expected shape.",
      unknownTypes: [],
    };
  }

  const unknownTypes = widgetTypesIn(parsed.data).filter((type) => !knownTypes.has(type));
  if (unknownTypes.length > 0) {
    return {
      ok: false,
      message: `This layout uses ${unknownTypes.length === 1 ? "a widget" : "widgets"} this version of Nexus OS does not have: ${unknownTypes.join(", ")}.`,
      nextStep:
        "Update Nexus OS, or open the file and remove those widgets, then import it again. Nothing has been changed.",
      unknownTypes,
    };
  }

  const widgetCount = parsed.data.pages.reduce((total, page) => total + page.widgets.length, 0);
  return { ok: true, document: parsed.data, widgetCount };
}

/** The exported file. Wrapped so a file can say what produced it. */
export function buildExport(document: ConfigDocument): string {
  return `${JSON.stringify(
    {
      exportedBy: "Nexus Studio",
      exportedAt: new Date().toISOString(),
      schemaVersion: document.schemaVersion,
      document,
    },
    null,
    2,
  )}\n`;
}

/* -------------------------------------------------------------------------- */
/* The advanced JSON editor                                                    */
/* -------------------------------------------------------------------------- */

export interface JsonIssue {
  path: string;
  message: string;
}

export type JsonParseResult<T> = { ok: true; value: T } | { ok: false; issues: JsonIssue[] };

interface MinimalSchema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: ReadonlyArray<string | number | symbol>; message: string }> } };
}

/** Parses and validates hand-edited JSON, reporting every problem inline. */
export function parseJsonAgainst<T>(text: string, schema: MinimalSchema<T>): JsonParseResult<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          path: "",
          message: error instanceof Error ? error.message : "This is not valid JSON.",
        },
      ],
    };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.map((part) => String(part)).join("."),
      message: issue.message,
    })),
  };
}

/**
 * The JSON editor may change anything about a widget except its identity: the
 * address is how every other operation, history entry and audit row refers to it.
 */
export function identityProblem(original: WidgetNode, edited: WidgetNode): string | null {
  if (edited.id !== original.id) {
    return "The id cannot be changed here — it is how history and undo refer to this widget. Duplicate the widget instead.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Colour                                                                      */
/* -------------------------------------------------------------------------- */

const TOKEN_ALIASES: Record<string, keyof ThemeTokens> = {
  accent: "accent",
  accentSoft: "accentSoft",
  accentContrast: "accentContrast",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  textPrimary: "textPrimary",
  textSecondary: "textSecondary",
  textMuted: "textMuted",
  surface: "surface",
  surfaceRaised: "surfaceRaised",
  surfaceSunken: "surfaceSunken",
  canvas: "canvas",
  border: "border",
  borderStrong: "borderStrong",
};

/** The colours the picker offers as theme-following choices. */
export const COLOUR_TOKENS: Array<{ value: string; label: string }> = [
  { value: "token:accent", label: "Accent (follows the theme)" },
  { value: "token:success", label: "Success" },
  { value: "token:warning", label: "Warning" },
  { value: "token:danger", label: "Danger" },
  { value: "token:info", label: "Information" },
  { value: "token:textPrimary", label: "Primary text" },
  { value: "token:textSecondary", label: "Secondary text" },
];

/** Resolves "token:accent" or "#1B2A4A" to a hex colour for contrast checking. */
export function resolveColourToHex(value: string, theme: Theme): string | null {
  if (!value) return null;
  if (value.startsWith("token:")) {
    const key = TOKEN_ALIASES[value.slice("token:".length)];
    return key ? theme.tokens[key] : null;
  }
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null;
}

export const COLOUR_PATTERN = /^(#[0-9a-fA-F]{3,8}|token:[a-zA-Z][\w.-]*)$/;

export function isValidColourValue(value: string): boolean {
  return COLOUR_PATTERN.test(value);
}

/**
 * Warns before a colour is saved, not after it ships: a widget accent that cannot
 * be read against the panel it sits on is a bug the editor can catch.
 */
export function contrastWarning(
  value: string,
  theme: Theme,
  againstToken: keyof ThemeTokens = "surfaceRaised",
): string | null {
  const foreground = resolveColourToHex(value, theme);
  if (!foreground) return null;
  const background = theme.tokens[againstToken];
  if (meetsContrastAA(foreground, background, true)) return null;
  const ratio = contrastRatio(foreground, background);
  return `This colour has a contrast of ${ratio.toFixed(1)}:1 against the panel behind it. WCAG AA asks for at least 3:1 for large text and 4.5:1 for body text — choose a lighter or darker colour, or use a theme colour.`;
}

/** The theme editor's own check, run over the pairs a theme actually draws. */
export function themeContrastReport(theme: Theme): Array<{ pair: string; ratio: number; passes: boolean }> {
  const pairs: Array<[string, keyof ThemeTokens, keyof ThemeTokens, boolean]> = [
    ["Body text on a panel", "textPrimary", "surfaceRaised", false],
    ["Secondary text on a panel", "textSecondary", "surfaceRaised", false],
    ["Muted text on a panel", "textMuted", "surfaceRaised", true],
    ["Text on the page background", "textPrimary", "canvas", false],
    ["Label on an accent button", "accentContrast", "accent", false],
  ];
  return pairs.map(([pair, foreground, background, large]) => ({
    pair,
    ratio: contrastRatio(theme.tokens[foreground], theme.tokens[background]),
    passes: meetsContrastAA(theme.tokens[foreground], theme.tokens[background], large),
  }));
}

export function themeFor(themeId: string): Theme {
  return themeById(themeId);
}

/* -------------------------------------------------------------------------- */
/* Keyboard shortcuts                                                          */
/* -------------------------------------------------------------------------- */

const MODIFIER_KEYS = new Set(["Meta", "Control", "Shift", "Alt", "OS", "Hyper", "Super"]);

export interface ShortcutSource {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Turns a key press into the stored shortcut string, e.g. "cmd+shift+1". */
export function formatShortcut(event: ShortcutSource): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const parts: string[] = [];
  if (event.metaKey) parts.push("cmd");
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  const key = event.key === " " ? "space" : event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  parts.push(key);
  return parts.join("+");
}

/** How a stored shortcut is spelled out for a reader. */
export function describeShortcut(shortcut: string): string {
  if (!shortcut) return "No shortcut";
  return shortcut
    .split("+")
    .map((part) => {
      if (part === "cmd") return "Command";
      if (part === "ctrl") return "Control";
      if (part === "alt") return "Option";
      if (part === "shift") return "Shift";
      if (part === "space") return "Space";
      return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" + ");
}

/* -------------------------------------------------------------------------- */
/* The widget gallery                                                          */
/* -------------------------------------------------------------------------- */

const CATEGORY_ORDER = [
  "Essentials",
  "AI",
  "Games",
  "Commerce",
  "Knowledge",
  "Automation",
  "System",
  "Web",
  "Finance",
] as const;

export function filterDefinitions(definitions: WidgetDefinition[], query: string): WidgetDefinition[] {
  const needle = query.trim().toLowerCase();
  const sorted = [...definitions].sort((a, b) => a.name.localeCompare(b.name));
  if (!needle) return sorted;
  return sorted.filter((definition) =>
    [definition.name, definition.summary, definition.type, definition.category]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function groupDefinitions(
  definitions: WidgetDefinition[],
): Array<{ category: string; widgets: WidgetDefinition[] }> {
  const grouped = new Map<string, WidgetDefinition[]>();
  for (const definition of definitions) {
    const list = grouped.get(definition.category) ?? [];
    list.push(definition);
    grouped.set(definition.category, list);
  }
  const rank = (name: string) => {
    const index = (CATEGORY_ORDER as readonly string[]).indexOf(name);
    return index === -1 ? CATEGORY_ORDER.length : index;
  };
  return [...grouped.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([category, widgets]) => ({ category, widgets }));
}

/* -------------------------------------------------------------------------- */
/* Accessibility checks the inspector runs while you type                      */
/* -------------------------------------------------------------------------- */

/** Alt text is not optional decoration; an empty one is reported every time. */
export function altTextWarning(value: ImageSourceValue): string | null {
  if (value.altText.trim().length > 0) return null;
  return "This image has no description yet. Anyone using a screen reader will hear nothing here — describe what the picture shows, or write “Decorative” if it carries no meaning.";
}

/** Plain-language description of what an action will actually do. */
export function describeAction(action: ActionValue): string {
  switch (action.type) {
    case "none":
      return "Nothing happens when this is chosen.";
    case "openURL":
      return action.target ? `Opens ${action.target} in your browser.` : "Add the https address to open.";
    case "launchApplication":
      return action.target
        ? `Asks Nexus Desktop to open ${action.target} on your Mac.`
        : "Choose which application to open.";
    case "openFile":
      return action.target ? `Asks Nexus Desktop to open ${action.target}.` : "Choose which file to open.";
    case "openFolder":
      return action.target ? `Asks Nexus Desktop to reveal ${action.target}.` : "Choose which folder to reveal.";
    case "runWorkflow":
      return action.target ? `Opens the workflow “${action.target}” so you can run it.` : "Choose a workflow.";
    case "openPanel":
      return action.target ? `Opens the ${action.target} panel inside Nexus OS.` : "Choose which panel to open.";
    case "switchWorkspace":
      return action.target ? `Switches to the ${action.target} workspace.` : "Choose a workspace.";
    case "runCommand":
      return action.target
        ? `Runs the built-in command “${action.target}”.`
        : "Choose one of the built-in commands. Nexus OS never runs typed-in commands.";
    case "showTutorial":
      return action.target ? `Opens the “${action.target}” walkthrough.` : "Choose a walkthrough.";
    case "invokeMCPTool":
      return action.target
        ? `Opens the MCP Centre at ${action.target}, where its permissions are shown before it can run.`
        : "Choose a tool.";
  }
}

/** Whether an action is complete enough to do anything when chosen. */
export function actionProblem(action: ActionValue): string | null {
  if (action.type === "none") return null;
  if (!action.target.trim()) {
    return "This action has no target yet, so choosing it would do nothing. Pick one, or set the action back to “Nothing”.";
  }
  if (action.type === "openURL" && !/^https:\/\//i.test(action.target)) {
    return "Nexus OS only opens plain https addresses. Enter one that starts with https://.";
  }
  if (action.fallbackURL && !/^https:\/\//i.test(action.fallbackURL)) {
    return "The fallback address must start with https://.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Inspector layout                                                            */
/* -------------------------------------------------------------------------- */

export interface VisibleProperty {
  key: string;
  definition: PropertyDefinition;
}

/**
 * `inspectorGroups` decides which fields exist and in what order; this decides
 * which of them apply to the value the widget currently holds. Splitting the two
 * is why `visibleWhen` needs no per-widget code.
 */
export function applyVisibleWhen(
  properties: VisibleProperty[],
  settings: Record<string, unknown>,
): VisibleProperty[] {
  return properties.filter((entry) => {
    const rule = entry.definition.visibleWhen;
    if (!rule) return true;
    return settings[rule.property] === rule.equals;
  });
}

/** Human wording for a duration stored in seconds. */
export function formatSeconds(seconds: number): string {
  if (seconds <= 0) return "Only when asked";
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}

/** Saving state shown next to the toolbar. Never an unlabelled spinner. */
export type SaveState = "idle" | "saving" | "saved" | "localOnly" | "failed";

export function describeSaveState(state: SaveState, channel: "live" | "draft"): { label: string; tone: "positive" | "neutral" | "caution" | "critical" } {
  switch (state) {
    case "saving":
      return { label: "Saving…", tone: "neutral" };
    case "saved":
      return channel === "draft"
        ? { label: "Draft updated", tone: "neutral" }
        : { label: "All changes saved", tone: "positive" };
    case "localOnly":
      return { label: "Changed here only — not saved", tone: "caution" };
    case "failed":
      return { label: "Could not save", tone: "critical" };
    case "idle":
      return channel === "draft"
        ? { label: "Draft — not published", tone: "caution" }
        : { label: "Published", tone: "positive" };
  }
}
