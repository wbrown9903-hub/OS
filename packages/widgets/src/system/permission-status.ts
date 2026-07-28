import type { WidgetDefinition } from "@nexus/schemas";
import { refreshProperty, titleProperty } from "../helpers.js";

/** Which macOS permissions have been granted, and how to fix the ones that have not. */
export const permissionStatusWidget: WidgetDefinition = {
  type: "system.permissionStatus",
  name: "Permissions",
  summary: "Which macOS permissions Nexus OS has, and how to change them.",
  category: "System",
  icon: "lock.shield",
  defaultSpan: { columns: 4, rows: 2 },
  minimumSpan: { columns: 3, rows: 1 },
  requiresBridge: true,
  dataEndpoint: "/api/widgets/permissions",
  defaultRefreshSeconds: 300,
  helpTopicId: "widget-permissions",
  previewHint: "Every permission can be withdrawn at any time in System Settings.",
  schema: {
    title: titleProperty("Permissions"),
    permissions: {
      kind: "multiSelect",
      label: "Permissions shown",
      help: "Each ticked permission gets a row saying whether it is granted and what it lets Nexus OS do.",
      defaultValue: ["accessibility", "automation", "files", "notifications"],
      options: [
        { value: "accessibility", label: "Accessibility — arrange windows" },
        { value: "automation", label: "Automation — control other apps" },
        { value: "files", label: "Files and folders" },
        { value: "notifications", label: "Notifications" },
        { value: "screenRecording", label: "Screen recording" },
        { value: "microphone", label: "Microphone" },
        { value: "calendar", label: "Calendar" },
      ],
      group: "Data",
    },
    showWhatItEnables: {
      kind: "toggle",
      label: "Explain what each one enables",
      help: "Adds a line describing exactly what stops working without it.",
      defaultValue: true,
      group: "Appearance",
    },
    hideWhenAllGranted: {
      kind: "toggle",
      label: "Hide when everything is granted",
      help: "The widget disappears once there is nothing to fix, and comes back if a permission is withdrawn.",
      defaultValue: false,
      group: "Behaviour",
    },
    refreshSeconds: refreshProperty(300),
  },
};
