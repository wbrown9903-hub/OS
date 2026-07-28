import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, emptyMessageProperty, titleProperty } from "../helpers.js";

/** A library of prompts the user keeps. Stored in the layout, not in a model. */
export const savedPromptsWidget: WidgetDefinition = {
  type: "ai.savedPrompts",
  name: "Saved prompts",
  summary: "Your own library of prompts, one click from being used.",
  category: "AI",
  icon: "bookmark",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 2, rows: 2 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-saved-prompts",
  previewHint: "Starts empty — add the prompts you actually reuse.",
  schema: {
    title: titleProperty("Saved prompts"),
    prompts: {
      kind: "list",
      label: "Prompts",
      help: "Each row is one prompt. Give it a name you will recognise in a hurry.",
      defaultValue: [],
      itemLabel: "Prompt",
      itemSchema: {
        name: {
          kind: "text",
          label: "Name",
          help: "Short and recognisable, for example “Rewrite as plain English”.",
          defaultValue: "",
          maxLength: 60,
        },
        prompt: {
          kind: "longText",
          label: "Prompt text",
          help: "The words sent to the model. {{selection}} and {{clipboard}} are replaced when it runs.",
          defaultValue: "",
          maxLength: 8000,
        },
        target: {
          kind: "select",
          label: "Send to",
          help: "Where this prompt goes when you choose it.",
          defaultValue: "runner",
          options: [
            { value: "runner", label: "The prompt runner on this page" },
            { value: "claude", label: "Claude" },
            { value: "chatgpt", label: "ChatGPT" },
            { value: "clipboard", label: "Copy to the clipboard" },
          ],
        },
        shortcut: {
          kind: "shortcut",
          label: "Shortcut",
          help: "Optional keyboard shortcut for this one prompt.",
          defaultValue: "",
        },
      },
      group: "Content",
    },
    showSearch: {
      kind: "toggle",
      label: "Show a search field",
      help: "Worth turning on once you have more than a handful of prompts.",
      defaultValue: true,
      group: "Appearance",
    },
    sortBy: {
      kind: "select",
      label: "Order",
      help: "How the list is sorted.",
      defaultValue: "manual",
      options: [
        { value: "manual", label: "The order you set" },
        { value: "name", label: "By name" },
        { value: "recent", label: "Most recently used first" },
      ],
      group: "Appearance",
    },
    count: countProperty("Prompts shown", 6, 30),
    emptyMessage: emptyMessageProperty("No saved prompts yet."),
  },
};
