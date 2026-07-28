import type { WidgetDefinition } from "@nexus/schemas";
import { actionValue, titleProperty } from "../helpers.js";

/** Applications the user pins. Launching needs the Bridge; the list itself does not. */
export const favouriteAppsWidget: WidgetDefinition = {
  type: "essentials.favouriteApps",
  name: "Favourite apps",
  summary: "One-click launching for the apps you use every day.",
  category: "Essentials",
  icon: "star.square",
  defaultSpan: { columns: 4, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  requiresBridge: true,
  helpTopicId: "widget-favourite-apps",
  defaultRefreshSeconds: 0,
  previewHint: "Add your apps here. Launching them needs Nexus Desktop running.",
  schema: {
    title: titleProperty("Favourite apps"),
    apps: {
      kind: "list",
      label: "Applications",
      help: "Each row is one app. Nexus OS shows a “not installed” badge rather than hiding an app you have not installed yet.",
      defaultValue: [],
      itemLabel: "Application",
      itemSchema: {
        label: {
          kind: "text",
          label: "Name",
          help: "What to call this app on the button.",
          defaultValue: "",
          maxLength: 40,
        },
        launch: {
          kind: "action",
          label: "What the button does",
          help: "Choose “Launch application” and name the app. Add a web address as the fallback so the button still works when the app is missing.",
          defaultValue: actionValue({ type: "launchApplication" }),
        },
        icon: {
          kind: "icon",
          label: "Icon",
          help: "Used until the real app icon is read from your Mac.",
          defaultValue: "app.badge",
        },
      },
      group: "Content",
    },
    iconSize: {
      kind: "slider",
      label: "Icon size",
      help: "Bigger icons are easier to hit; smaller icons fit more into the same widget.",
      defaultValue: 44,
      min: 28,
      max: 72,
      step: 2,
      group: "Appearance",
    },
    showLabels: {
      kind: "toggle",
      label: "Show names",
      help: "Turn this off for icons only. Names are always read out by VoiceOver either way.",
      defaultValue: true,
      group: "Appearance",
    },
  },
};
