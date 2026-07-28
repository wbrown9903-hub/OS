import type { WidgetDefinition } from "@nexus/schemas";
import { actionValue, titleProperty } from "../helpers.js";

/** A named group of launch buttons — the building block of a workspace page. */
export const launcherGroupWidget: WidgetDefinition = {
  type: "system.launcherGroup",
  name: "Launcher group",
  summary: "A titled group of buttons that open apps, files, folders or workspaces.",
  category: "System",
  icon: "square.grid.2x2",
  defaultSpan: { columns: 6, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  requiresBridge: true,
  helpTopicId: "widget-launcher-group",
  defaultRefreshSeconds: 0,
  previewHint: "Opening apps, files and folders needs Nexus Desktop running.",
  schema: {
    title: titleProperty("Launcher"),
    items: {
      kind: "list",
      label: "Buttons",
      help: "Each row is one button. Every button must do something real — a button with no action is not shown.",
      defaultValue: [],
      itemLabel: "Button",
      itemSchema: {
        label: {
          kind: "text",
          label: "Wording",
          help: "What the button says.",
          defaultValue: "",
          maxLength: 40,
        },
        icon: {
          kind: "icon",
          label: "Icon",
          help: "A symbol shown above or beside the wording.",
          defaultValue: "app.badge",
        },
        action: {
          kind: "action",
          label: "What it does",
          help: "Pick from the list of actions Nexus OS knows how to check and run.",
          defaultValue: actionValue({ type: "launchApplication" }),
        },
      },
      group: "Content",
    },
    columns: {
      kind: "slider",
      label: "Buttons per row",
      help: "How many buttons sit side by side before wrapping.",
      defaultValue: 4,
      min: 1,
      max: 8,
      step: 1,
      group: "Appearance",
    },
    buttonSize: {
      kind: "slider",
      label: "Button size",
      help: "Larger buttons are easier to hit, particularly on a big display across the room.",
      defaultValue: 64,
      min: 40,
      max: 120,
      step: 4,
      group: "Appearance",
    },
    showLabels: {
      kind: "toggle",
      label: "Show wording",
      help: "Turn this off for icons only. The wording is still read by VoiceOver.",
      defaultValue: true,
      group: "Appearance",
    },
  },
};
