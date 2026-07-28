import { themes, type ConfigDocument, type Operation } from "@nexus/schemas";
import type { RunnableIntent } from "./actions";
import { actionFromDocument } from "./actions";
import { settingsSections, shellDestinations } from "./navigation";
import type { ConnectionRecord, HelpTopic } from "./types";

/**
 * Everything the command palette can reach, as one flat list.
 *
 * Each entry carries a `RunnableIntent`, so "run this result" is the same code
 * path as "click this dock tile" or "accept this natural-language phrase". There
 * is no second command dispatcher anywhere in the shell.
 */

export type PaletteGroup =
  | "Suggested"
  | "Actions"
  | "Apps & screens"
  | "Dashboards"
  | "Workspaces"
  | "Settings"
  | "Connections"
  | "Help"
  | "Knowledge";

export interface PaletteEntry {
  id: string;
  group: PaletteGroup;
  title: string;
  subtitle: string;
  icon: string;
  keywords: string[];
  intent: RunnableIntent;
}

export interface PaletteSources {
  document: ConfigDocument;
  helpTopics: HelpTopic[];
  connections: ConnectionRecord[];
  activeWorkspaceId: string;
}

const setPreference = (key: string, value: unknown): Operation[] => [
  { op: "set", path: ["preferences", key], value },
];

export function buildPaletteEntries(sources: PaletteSources): PaletteEntry[] {
  const { document, helpTopics, connections } = sources;
  const entries: PaletteEntry[] = [];

  /* --- Screens this app implements ---------------------------------------- */
  for (const destination of shellDestinations) {
    entries.push({
      id: `screen:${destination.id}`,
      group: "Apps & screens",
      title: destination.title,
      subtitle: destination.summary,
      icon: destination.icon,
      keywords: destination.keywords,
      intent: {
        title: `Open ${destination.title}`,
        detail: destination.summary,
        action: { kind: "navigate", href: destination.href },
        confirmation: null,
      },
    });
  }

  /* --- Settings screens ---------------------------------------------------- */
  for (const section of settingsSections) {
    entries.push({
      id: `settings:${section.id}`,
      group: "Settings",
      title: section.title,
      subtitle: section.summary,
      icon: section.icon,
      keywords: ["settings", ...section.keywords],
      intent: {
        title: `Open ${section.title}`,
        detail: section.summary,
        action: { kind: "navigate", href: section.href },
        confirmation: null,
      },
    });
  }

  /* --- Dashboards from the configuration document -------------------------- */
  for (const page of document.pages) {
    entries.push({
      id: `page:${page.id}`,
      group: "Dashboards",
      title: page.title,
      subtitle: `${page.widgets.length} widget${page.widgets.length === 1 ? "" : "s"} on this dashboard`,
      icon: page.icon,
      keywords: ["dashboard", "page", "layout"],
      intent: {
        title: `Open the ${page.title} dashboard`,
        detail: "Shows this dashboard on the canvas.",
        action: { kind: "navigate", href: `/dashboard?page=${encodeURIComponent(page.id)}` },
        confirmation: null,
      },
    });
  }

  /* --- Workspaces ---------------------------------------------------------- */
  for (const workspace of document.workspaces) {
    entries.push({
      id: `workspace:${workspace.id}`,
      group: "Workspaces",
      title: `Switch to ${workspace.title}`,
      subtitle:
        workspace.onEnter.length > 0
          ? `Also runs ${workspace.onEnter.length} start-up action${workspace.onEnter.length === 1 ? "" : "s"}`
          : "Changes the active workspace",
      icon: workspace.icon,
      keywords: ["workspace", "switch", "space", workspace.title],
      intent: {
        title: `Switch to ${workspace.title}`,
        detail: "Changes the active workspace and the dashboards it shows.",
        action: { kind: "switchWorkspace", workspaceId: workspace.id },
        confirmation: null,
      },
    });
  }

  /* --- Dock items (may include applications and links) ---------------------- */
  for (const item of document.dock) {
    const intent = actionFromDocument(item.action, item.label);
    entries.push({
      id: `dock:${item.id}`,
      group: "Apps & screens",
      title: item.label,
      subtitle: intent.detail,
      icon: item.icon,
      keywords: ["dock", "app", item.label],
      intent,
    });
  }

  /* --- Connections --------------------------------------------------------- */
  for (const connection of connections) {
    entries.push({
      id: `connection:${connection.id}`,
      group: "Connections",
      title: connection.label,
      subtitle: `Connection status: ${connection.state}`,
      icon: "link",
      keywords: ["connection", "service", connection.service],
      intent: {
        title: `Open the ${connection.label} connection`,
        detail: "Shows the connection's state, history and what to do next.",
        action: { kind: "navigate", href: `/settings/connections/${connection.service}` },
        confirmation: null,
      },
    });
  }

  /* --- Help ---------------------------------------------------------------- */
  for (const topic of helpTopics) {
    entries.push({
      id: `help:${topic.id}`,
      group: "Help",
      title: topic.title,
      subtitle: topic.summary,
      icon: "questionmark.circle",
      keywords: ["help", "how to", "guide", ...topic.steps.map((step) => step.title)],
      intent: {
        title: `Open “${topic.title}”`,
        detail: "Opens the walkthrough in a panel you can keep open while you follow it.",
        action: { kind: "openHelp", topicId: topic.id, title: topic.title },
        confirmation: null,
      },
    });
  }

  /* --- Commands ------------------------------------------------------------ */
  for (const theme of themes) {
    if (theme.id === document.themeId) continue;
    entries.push({
      id: `theme:${theme.id}`,
      group: "Actions",
      title: `Use the ${theme.name} theme`,
      subtitle: theme.description,
      icon: "paintpalette",
      keywords: ["theme", "appearance", theme.appearance, theme.name, "colour", "color"],
      intent: {
        title: `Use the ${theme.name} theme`,
        detail: "Changes colours everywhere immediately. You can change back at any time.",
        action: { kind: "applyOperations", operations: [{ op: "set", path: ["themeId"], value: theme.id }], label: `Use the ${theme.name} theme` },
        confirmation: null,
      },
    });
  }

  const animationsOn = document.preferences.animationIntensity > 0;
  entries.push({
    id: "command:animation",
    group: "Actions",
    title: animationsOn ? "Turn off animation" : "Turn animation back on",
    subtitle: animationsOn
      ? "Everything moves instantly instead of sliding or fading."
      : "Restores the standard amount of movement.",
    icon: "wand.and.rays",
    keywords: ["motion", "animation", "reduce", "movement", "accessibility"],
    intent: {
      title: animationsOn ? "Turn off animation" : "Turn animation back on",
      detail: "Applies to the whole interface, not one screen.",
      action: {
        kind: "applyOperations",
        operations: setPreference("animationIntensity", animationsOn ? 0 : 0.8),
        label: animationsOn ? "Turn off animation" : "Turn animation on",
      },
      confirmation: null,
    },
  });

  const compact = document.preferences.density === "compact";
  entries.push({
    id: "command:density",
    group: "Actions",
    title: compact ? "Use comfortable spacing" : "Use compact spacing",
    subtitle: compact ? "More room around everything." : "Fits more on screen.",
    icon: "arrow.up.left.and.arrow.down.right",
    keywords: ["density", "spacing", "compact", "comfortable", "size"],
    intent: {
      title: compact ? "Use comfortable spacing" : "Use compact spacing",
      detail: "Changes spacing across every screen.",
      action: {
        kind: "applyOperations",
        operations: setPreference("density", compact ? "comfortable" : "compact"),
        label: compact ? "Use comfortable spacing" : "Use compact spacing",
      },
      confirmation: null,
    },
  });

  entries.push({
    id: "command:refresh",
    group: "Actions",
    title: "Refresh every connection",
    subtitle: "Checks each connected service again and updates the status chips.",
    icon: "arrow.clockwise",
    keywords: ["refresh", "reload", "update", "sync", "check"],
    intent: {
      title: "Refresh every connection",
      detail: "Re-checks connections, the Mac Bridge, notifications and the widget catalogue.",
      action: { kind: "refreshServices" },
      confirmation: null,
    },
  });

  entries.push({
    id: "command:undo",
    group: "Actions",
    title: "Undo the last layout change",
    subtitle: "Applies the exact inverse of the most recent change.",
    icon: "arrow.uturn.backward",
    keywords: ["undo", "revert", "back", "mistake"],
    intent: {
      title: "Undo the last layout change",
      detail: "Restores the layout as it was before your most recent change.",
      action: { kind: "undo" },
      confirmation: null,
    },
  });

  entries.push({
    id: "command:redo",
    group: "Actions",
    title: "Redo the change you undid",
    subtitle: "Re-applies the change that was just undone.",
    icon: "arrow.uturn.forward",
    keywords: ["redo", "forward", "again"],
    intent: {
      title: "Redo the change you undid",
      detail: "Re-applies the most recently undone change.",
      action: { kind: "redo" },
      confirmation: null,
    },
  });

  entries.push({
    id: "command:onboarding",
    group: "Actions",
    title: "Run the setup walkthrough again",
    subtitle: "Ten short steps covering everything Nexus OS can do.",
    icon: "sparkles",
    keywords: ["onboarding", "setup", "tour", "walkthrough", "first run", "wizard"],
    intent: {
      title: "Run the setup walkthrough again",
      detail: "Goes back to the ten-step setup. Nothing is reset until you choose something in it.",
      action: { kind: "navigate", href: "/onboarding" },
      confirmation: null,
    },
  });

  entries.push({
    id: "command:exit",
    group: "Actions",
    title: "Exit to macOS",
    subtitle: "Leaves the Nexus OS interface and returns you to the plain desktop.",
    icon: "rectangle.portrait.and.arrow.right",
    keywords: ["exit", "quit", "leave", "macos", "desktop", "escape", "back to mac"],
    intent: {
      title: "Exit to macOS",
      detail: "Hides the Nexus OS window. Nothing is closed or lost, and you can come straight back.",
      action: { kind: "exitToDesktop" },
      confirmation: {
        title: "Exit to macOS?",
        body: "The Nexus OS window is hidden and you return to your plain desktop. Nothing is closed and nothing is lost.",
        confirmLabel: "Exit to macOS",
        destructive: false,
      },
    },
  });

  return entries;
}
