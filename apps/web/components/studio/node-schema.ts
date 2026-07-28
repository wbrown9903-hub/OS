import type { PropertyDefinition, PropertySchema, WidgetDefinition, Zone } from "@nexus/schemas";

/**
 * The widget *node* fields — size, order, priority, visibility, refresh — as a
 * property schema.
 *
 * They are not part of any widget's own schema (they belong to the document, and
 * every widget has them), but describing them the same way means the inspector
 * renders them with the very same controls, and there is still no bespoke form
 * anywhere in Studio.
 */

export interface NodeFieldGroup {
  group: string;
  properties: Array<{ key: string; definition: PropertyDefinition }>;
}

const PERMISSIONS = [
  { value: "", label: "No permission needed" },
  { value: "files", label: "Files and folders" },
  { value: "accessibility", label: "Accessibility (window control)" },
  { value: "notifications", label: "Notifications" },
  { value: "automation", label: "Automation (control other apps)" },
];

export function layoutSchema(
  definition: WidgetDefinition | undefined,
  zones: Zone[],
  services: string[],
): PropertySchema {
  const minimumColumns = definition?.minimumSpan.columns ?? 1;
  const minimumRows = definition?.minimumSpan.rows ?? 1;

  const schema: PropertySchema = {
    zone: {
      kind: "select",
      label: "Area of the page",
      help: "Which part of the page this sits in. Areas are laid out separately, so moving a panel here changes where it appears without touching anything else.",
      defaultValue: zones[0]?.id ?? "main",
      options: zones.map((zone) => ({ value: zone.id, label: zone.label })),
      group: "Layout",
    },
    columns: {
      kind: "slider",
      label: "Width",
      help: "Width in the 12-column grid. Nexus OS scales this to whatever display you are on, so one setting is right on a laptop and on a large screen.",
      defaultValue: definition?.defaultSpan.columns ?? 4,
      min: minimumColumns,
      max: 12,
      step: 1,
      group: "Layout",
    },
    rows: {
      kind: "slider",
      label: "Height",
      help: "Height in rows. Taller panels show more rows of content before scrolling.",
      defaultValue: definition?.defaultSpan.rows ?? 2,
      min: minimumRows,
      max: 12,
      step: 1,
      group: "Layout",
    },
    pinned: {
      kind: "toggle",
      label: "Keep at the top",
      help: "Pinned panels always lead their area and are never dropped when space runs short.",
      defaultValue: false,
      group: "Layout",
    },
    priority: {
      kind: "slider",
      label: "Importance",
      help: "Lower numbers survive longer when a narrow window cannot fit everything. 50 is normal.",
      defaultValue: 50,
      min: 0,
      max: 100,
      step: 5,
      group: "Layout",
      advanced: true,
    },
    hidden: {
      kind: "toggle",
      label: "Hide this panel",
      help: "Takes it off the dashboard without deleting it or losing its settings.",
      defaultValue: false,
      group: "Visibility",
    },
    requiresConnection: {
      kind: "select",
      label: "Needs a connection",
      help: "When the named service is not connected, the panel explains that and offers a way to connect instead of disappearing.",
      defaultValue: "",
      options: [{ value: "", label: "No connection needed" }, ...services.map((service) => ({ value: service, label: service }))],
      group: "Visibility",
      advanced: true,
    },
    requiresBridge: {
      kind: "toggle",
      label: "Needs Nexus Desktop",
      help: "Turn this on for panels that launch apps or arrange windows. Without the Mac app running they explain themselves rather than failing quietly.",
      defaultValue: false,
      group: "Visibility",
      advanced: true,
    },
    requiresPermission: {
      kind: "select",
      label: "Needs a macOS permission",
      help: "When the permission has not been granted, the panel says which one and links straight to it.",
      defaultValue: "",
      options: PERMISSIONS,
      group: "Visibility",
      advanced: true,
    },
    minimumWidth: {
      kind: "number",
      label: "Hide below this window width",
      help: "In pixels. Leave at 0 to always show it. Useful for wide panels that become unreadable in a narrow window.",
      defaultValue: 0,
      min: 0,
      max: 4000,
      step: 50,
      unit: "px",
      group: "Visibility",
      advanced: true,
    },
    refreshSeconds: {
      kind: "duration",
      label: "Refresh every",
      help: "How often this panel asks for new information. Longer gaps use less battery and fewer requests against your account limits.",
      defaultValue: 0,
      min: 0,
      max: 86400,
      group: "Data",
    },
    shortcut: {
      kind: "shortcut",
      label: "Keyboard shortcut",
      help: "Press this anywhere on the dashboard to jump straight to this panel.",
      defaultValue: "",
      group: "Data",
      advanced: true,
    },
  };

  return schema;
}

/** Where each node field lives inside the widget node. */
export const NODE_FIELD_PATHS: Record<string, string[]> = {
  zone: ["zone"],
  columns: ["span", "columns"],
  rows: ["span", "rows"],
  pinned: ["pinned"],
  priority: ["priority"],
  hidden: ["visibility", "hidden"],
  requiresConnection: ["visibility", "requiresConnection"],
  requiresBridge: ["visibility", "requiresBridge"],
  requiresPermission: ["visibility", "requiresPermission"],
  minimumWidth: ["visibility", "minimumWidth"],
  refreshSeconds: ["refreshSeconds"],
  shortcut: ["shortcut"],
};

/** Values stored as `null` are shown as an empty choice, and written back as null. */
export const NULLABLE_NODE_FIELDS = new Set([
  "requiresConnection",
  "requiresPermission",
  "shortcut",
]);

/** minimumWidth is stored as null rather than 0 when it does not apply. */
export function nodeFieldToStored(key: string, value: unknown): unknown {
  if (key === "minimumWidth") {
    const number = typeof value === "number" ? value : 0;
    return number > 0 ? number : null;
  }
  if (NULLABLE_NODE_FIELDS.has(key)) {
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  return value;
}

export function nodeFieldFromStored(key: string, value: unknown): unknown {
  if (key === "minimumWidth") return typeof value === "number" ? value : 0;
  if (NULLABLE_NODE_FIELDS.has(key)) return typeof value === "string" ? value : "";
  return value;
}
