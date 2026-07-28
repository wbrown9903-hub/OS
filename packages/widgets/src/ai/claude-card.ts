import type { WidgetDefinition } from "@nexus/schemas";
import { actionValue, imageValue, titleProperty } from "../helpers.js";

/** A launch card for Claude. Opens the app when it is installed, the web app otherwise. */
export const claudeCardWidget: WidgetDefinition = {
  type: "ai.claudeCard",
  name: "Claude",
  summary: "Open Claude, optionally with a prompt you have prepared.",
  category: "AI",
  icon: "sparkles",
  defaultSpan: { columns: 3, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-claude-card",
  previewHint: "Works straight away. Connect an API key only if you want replies inside Nexus OS.",
  schema: {
    title: titleProperty("Claude"),
    tagline: {
      kind: "text",
      label: "Supporting line",
      help: "A short reminder of what you use this one for, such as “long-form writing”.",
      defaultValue: "Thinking partner",
      maxLength: 80,
      group: "Content",
    },
    artwork: {
      kind: "image",
      label: "Card artwork",
      help: "Optional background for the card. Bundled Nexus artwork is used unless you choose otherwise.",
      defaultValue: imageValue({ builtInId: "nexus-aurora-01", altText: "Soft aurora gradient" }),
      aspectHint: "Wide — roughly 2:1",
      group: "Appearance",
    },
    launch: {
      kind: "action",
      label: "What the card opens",
      help: "Opens the Mac app when it is installed, and falls back to the web address when it is not.",
      defaultValue: actionValue({
        type: "launchApplication",
        target: "Claude",
        fallbackURL: "https://claude.ai/new",
      }),
      group: "Behaviour",
    },
    startingPrompt: {
      kind: "longText",
      label: "Starting prompt",
      help: "Copied into the message box when the card opens. Leave it empty to start from a blank conversation.",
      defaultValue: "",
      placeholder: "For example: help me plan today's work…",
      maxLength: 4000,
      group: "Content",
    },
    showRecentConversations: {
      kind: "toggle",
      label: "List recent conversations",
      help: "Needs an Anthropic connection. Without one the card still opens Claude, it just cannot list anything.",
      defaultValue: false,
      group: "Data",
    },
    shortcut: {
      kind: "shortcut",
      label: "Keyboard shortcut",
      help: "Press this anywhere in Nexus OS to open the card.",
      defaultValue: "",
      group: "Behaviour",
      advanced: true,
    },
  },
};
