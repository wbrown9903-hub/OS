import type { WidgetDefinition } from "@nexus/schemas";
import { actionValue, imageValue, titleProperty } from "../helpers.js";

/** A launch card for ChatGPT, with the same shape as the Claude card. */
export const chatgptCardWidget: WidgetDefinition = {
  type: "ai.chatgptCard",
  name: "ChatGPT",
  summary: "Open ChatGPT, optionally with a prompt you have prepared.",
  category: "AI",
  icon: "bubble.left.and.bubble.right",
  defaultSpan: { columns: 3, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-chatgpt-card",
  previewHint: "Works straight away. Connect an API key only if you want replies inside Nexus OS.",
  schema: {
    title: titleProperty("ChatGPT"),
    tagline: {
      kind: "text",
      label: "Supporting line",
      help: "A short reminder of what you use this one for.",
      defaultValue: "Quick answers",
      maxLength: 80,
      group: "Content",
    },
    artwork: {
      kind: "image",
      label: "Card artwork",
      help: "Optional background for the card. Bundled Nexus artwork is used unless you choose otherwise.",
      defaultValue: imageValue({ builtInId: "nexus-abstract-02", altText: "Soft abstract gradient" }),
      aspectHint: "Wide — roughly 2:1",
      group: "Appearance",
    },
    launch: {
      kind: "action",
      label: "What the card opens",
      help: "Opens the Mac app when it is installed, and falls back to the web address when it is not.",
      defaultValue: actionValue({
        type: "launchApplication",
        target: "ChatGPT",
        fallbackURL: "https://chatgpt.com/",
      }),
      group: "Behaviour",
    },
    startingPrompt: {
      kind: "longText",
      label: "Starting prompt",
      help: "Copied into the message box when the card opens. Leave it empty to start from a blank conversation.",
      defaultValue: "",
      maxLength: 4000,
      group: "Content",
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
