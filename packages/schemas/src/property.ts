import { z } from "zod";

/**
 * A property declaration is the single source of truth for one editable value.
 *
 * From this one object Nexus OS derives, without any per-widget code:
 *   - the control rendered in the Nexus Studio inspector
 *   - the zod validator used by the API and by import/export
 *   - the TypeScript type of the widget's settings
 *   - the default value used when a widget is added or reset
 *   - the help text shown by the "What is this?" button
 *
 * Adding a new widget therefore means writing one definition file, never
 * touching an editor, a validator, a migration and a form in five places.
 */

export type PropertyKind =
  | "text"
  | "longText"
  | "number"
  | "toggle"
  | "select"
  | "multiSelect"
  | "color"
  | "image"
  | "audio"
  | "url"
  | "link"
  | "action"
  | "shortcut"
  | "duration"
  | "slider"
  | "font"
  | "icon"
  | "connection"
  | "list";

interface PropertyBase<Kind extends PropertyKind, Value> {
  kind: Kind;
  /** Shown as the field's label in the inspector. */
  label: string;
  /** Plain-language explanation shown under the field and in contextual help. */
  help: string;
  defaultValue: Value;
  /** Groups fields into inspector sections, e.g. "Content", "Appearance". */
  group?: string;
  /** When present, the field only appears if this other property is truthy. */
  visibleWhen?: { property: string; equals: unknown };
  /** Beginner mode hides advanced fields rather than overwhelming the user. */
  advanced?: boolean;
}

export type PropertyDefinition =
  | (PropertyBase<"text", string> & { placeholder?: string; maxLength?: number })
  | (PropertyBase<"longText", string> & { placeholder?: string; maxLength?: number })
  | (PropertyBase<"number", number> & { min?: number; max?: number; step?: number; unit?: string })
  | PropertyBase<"toggle", boolean>
  | (PropertyBase<"select", string> & { options: ReadonlyArray<{ value: string; label: string; help?: string }> })
  | (PropertyBase<"multiSelect", string[]> & { options: ReadonlyArray<{ value: string; label: string }> })
  | PropertyBase<"color", string>
  | (PropertyBase<"image", ImageSourceValue> & { aspectHint?: string })
  | PropertyBase<"audio", AudioSourceValue>
  | (PropertyBase<"url", string> & { allowLocalNetwork?: boolean })
  | PropertyBase<"link", LinkValue>
  | PropertyBase<"action", ActionValue>
  | PropertyBase<"shortcut", string>
  | (PropertyBase<"duration", number> & { min?: number; max?: number })
  | (PropertyBase<"slider", number> & { min: number; max: number; step?: number })
  | PropertyBase<"font", string>
  | PropertyBase<"icon", string>
  | (PropertyBase<"connection", string | null> & { service: string })
  | (PropertyBase<"list", unknown[]> & { itemSchema: Record<string, PropertyDefinition>; itemLabel: string });

export type PropertySchema = Record<string, PropertyDefinition>;

/* -------------------------------------------------------------------------- */
/* Shared value shapes                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Images are never a bare string. Every image carries where it came from and what
 * to do when that source fails, which is what stops a changed remote feed from
 * breaking a dashboard.
 */
export const imageSourceSchema = z.object({
  mode: z.enum(["builtIn", "upload", "remoteURL", "officialFeed"]),
  /** Identifier of a bundled original asset. Always present as the last resort. */
  builtInId: z.string().default("nexus-abstract-01"),
  /** Path of a user-uploaded file inside the managed media store. */
  uploadPath: z.string().nullable().default(null),
  /** A URL the user typed. Validated before any fetch. */
  remoteURL: z.string().nullable().default(null),
  /** Identifier of a configured feed, e.g. "runescape-news". */
  feedId: z.string().nullable().default(null),
  /** Alternative text. Required for accessibility; the editor warns when empty. */
  altText: z.string().default(""),
  /** Attribution recorded when the image came from someone else's source. */
  attribution: z
    .object({ sourceURL: z.string(), label: z.string(), retrievedAt: z.string() })
    .nullable()
    .default(null),
});
export type ImageSourceValue = z.infer<typeof imageSourceSchema>;

export const audioSourceSchema = z.object({
  mode: z.enum(["builtIn", "upload", "silent"]),
  builtInId: z.string().default("nexus-chime"),
  uploadPath: z.string().nullable().default(null),
  volume: z.number().min(0).max(1).default(0.6),
});
export type AudioSourceValue = z.infer<typeof audioSourceSchema>;

export const linkSchema = z.object({
  url: z.string().default(""),
  label: z.string().default(""),
  openIn: z.enum(["browser", "panel", "desktopApp"]).default("browser"),
});
export type LinkValue = z.infer<typeof linkSchema>;

/**
 * Actions are structured, never free-form commands. A widget button can only ever
 * name an action the action registry already knows how to validate and run, which
 * is what keeps AI- or plugin-authored configuration from becoming shell access.
 */
export const actionSchema = z.object({
  type: z.enum([
    "none",
    "openURL",
    "launchApplication",
    "openFile",
    "openFolder",
    "runWorkflow",
    "openPanel",
    "switchWorkspace",
    "runCommand",
    "showTutorial",
    "invokeMCPTool",
  ]),
  /** Meaning depends on `type`; validated per type by the action registry. */
  target: z.string().default(""),
  /** Optional structured parameters, validated against the action's own schema. */
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  /** Shown to the user before anything consequential runs. */
  confirmationRequired: z.boolean().default(false),
  /** Used when the primary target is unavailable, e.g. an app is not installed. */
  fallbackURL: z.string().nullable().default(null),
});
export type ActionValue = z.infer<typeof actionSchema>;

/* -------------------------------------------------------------------------- */
/* Derivation: schema -> validator, defaults, inspector metadata               */
/* -------------------------------------------------------------------------- */

/** Builds the zod validator for a single declared property. */
export function validatorForProperty(definition: PropertyDefinition): z.ZodTypeAny {
  switch (definition.kind) {
    case "text":
    case "longText": {
      let schema = z.string();
      if (definition.maxLength !== undefined) schema = schema.max(definition.maxLength);
      return schema;
    }
    case "number":
    case "duration":
    case "slider": {
      let schema = z.number();
      if ("min" in definition && definition.min !== undefined) schema = schema.min(definition.min);
      if ("max" in definition && definition.max !== undefined) schema = schema.max(definition.max);
      return schema;
    }
    case "toggle":
      return z.boolean();
    case "select":
      return z.enum(definition.options.map((option) => option.value) as [string, ...string[]]);
    case "multiSelect":
      return z.array(z.enum(definition.options.map((option) => option.value) as [string, ...string[]]));
    case "color":
      // Accepts a hex colour or a theme token reference such as "token:accent".
      return z.string().regex(/^(#[0-9a-fA-F]{3,8}|token:[a-zA-Z][\w.-]*)$/, {
        message: "Use a hex colour such as #1B2A4A, or a theme colour such as token:accent.",
      });
    case "image":
      return imageSourceSchema;
    case "audio":
      return audioSourceSchema;
    case "url":
      return z.string();
    case "link":
      return linkSchema;
    case "action":
      return actionSchema;
    case "shortcut":
      return z.string();
    case "font":
    case "icon":
      return z.string();
    case "connection":
      return z.string().nullable();
    case "list":
      return z.array(validatorForSchema(definition.itemSchema));
  }
}

/** Builds the validator for a whole widget's settings from its property schema. */
export function validatorForSchema(schema: PropertySchema): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, definition] of Object.entries(schema)) {
    // Every property has a declared default, so every field is optional on input
    // and complete after parsing. Partial configuration can never crash a widget.
    shape[key] = validatorForProperty(definition).optional().default(definition.defaultValue as never);
  }
  return z.object(shape);
}

/** The settings object a freshly added — or freshly reset — widget starts with. */
export function defaultsForSchema(schema: PropertySchema): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, definition] of Object.entries(schema)) {
    result[key] = structuredClone(definition.defaultValue);
  }
  return result;
}

/**
 * Fills in anything missing and drops anything unknown, so a widget always
 * receives a complete settings object even after a partial import, a failed
 * migration or a hand-edited JSON document.
 */
export function reconcileSettings(
  schema: PropertySchema,
  stored: Record<string, unknown> | undefined,
): { settings: Record<string, unknown>; repaired: string[] } {
  const settings = defaultsForSchema(schema);
  const repaired: string[] = [];
  if (!stored) return { settings, repaired };

  for (const [key, definition] of Object.entries(schema)) {
    if (!(key in stored)) {
      repaired.push(`${key} was missing and uses its default`);
      continue;
    }
    const parsed = validatorForProperty(definition).safeParse(stored[key]);
    if (parsed.success) {
      settings[key] = parsed.data;
    } else {
      repaired.push(`${key} was not valid and uses its default`);
    }
  }
  for (const key of Object.keys(stored)) {
    if (!(key in schema)) repaired.push(`${key} is no longer used and was ignored`);
  }
  return { settings, repaired };
}

/** Inspector layout, derived so section order is consistent across every widget. */
export function inspectorGroups(
  schema: PropertySchema,
  mode: "beginner" | "standard" | "advanced" = "standard",
): Array<{ group: string; properties: Array<{ key: string; definition: PropertyDefinition }> }> {
  const order = ["Content", "Appearance", "Behaviour", "Data", "Advanced"];
  const groups = new Map<string, Array<{ key: string; definition: PropertyDefinition }>>();

  for (const [key, definition] of Object.entries(schema)) {
    if (mode === "beginner" && definition.advanced) continue;
    const group = definition.group ?? "Content";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push({ key, definition });
  }

  return [...groups.entries()]
    .sort((a, b) => {
      const rank = (name: string) => (order.indexOf(name) === -1 ? order.length : order.indexOf(name));
      return rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]);
    })
    .map(([group, properties]) => ({ group, properties }));
}

/** True when a field should currently be shown, honouring `visibleWhen`. */
export function isPropertyVisible(
  definition: PropertyDefinition,
  settings: Record<string, unknown>,
): boolean {
  if (!definition.visibleWhen) return true;
  return settings[definition.visibleWhen.property] === definition.visibleWhen.equals;
}
