import type { WidgetDefinition } from "@nexus/schemas";
import { titleProperty } from "../helpers.js";

/** Switches between the user's workspaces, which may open apps as they change. */
export const workspaceSwitcherWidget: WidgetDefinition = {
  type: "system.workspaceSwitcher",
  name: "Workspace switcher",
  summary: "Move between your workspaces in one press.",
  category: "System",
  icon: "rectangle.3.group",
  defaultSpan: { columns: 4, rows: 1 },
  minimumSpan: { columns: 2, rows: 1 },
  helpTopicId: "widget-workspace-switcher",
  defaultRefreshSeconds: 0,
  previewHint: "Lists the workspaces you have created.",
  schema: {
    title: titleProperty("Workspaces"),
    showAll: {
      kind: "toggle",
      label: "Show every workspace",
      help: "Turn this off to list only the workspaces you name below.",
      defaultValue: true,
      group: "Data",
    },
    workspaces: {
      kind: "list",
      label: "Workspaces shown",
      help: "Each row names one workspace to include, in the order you want them.",
      defaultValue: [],
      itemLabel: "Workspace",
      itemSchema: {
        workspaceId: {
          kind: "text",
          label: "Workspace",
          help: "The identifier of the workspace.",
          defaultValue: "",
          maxLength: 80,
        },
      },
      group: "Data",
      visibleWhen: { property: "showAll", equals: false },
    },
    layout: {
      kind: "select",
      label: "Arrangement",
      help: "How the workspaces are laid out in the widget.",
      defaultValue: "segments",
      options: [
        { value: "segments", label: "A single row of segments" },
        { value: "tiles", label: "Tiles" },
        { value: "list", label: "A list" },
      ],
      group: "Appearance",
    },
    showShortcuts: {
      kind: "toggle",
      label: "Show keyboard shortcuts",
      help: "Displays the shortcut for each workspace so they get learned.",
      defaultValue: true,
      group: "Appearance",
    },
    confirmIfAppsWillOpen: {
      kind: "toggle",
      label: "Ask before opening apps",
      help: "A workspace can open applications and arrange windows as you enter it. This asks first.",
      defaultValue: true,
      group: "Behaviour",
    },
  },
};
