import type { WidgetDefinition } from "@nexus/schemas";
import { titleProperty } from "../helpers.js";

/** A plain text scratchpad stored in the configuration document itself. */
export const notesWidget: WidgetDefinition = {
  type: "essentials.notes",
  name: "Notes pad",
  summary: "A scratchpad that stays where you put it.",
  category: "Essentials",
  icon: "note.text",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 2, rows: 2 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-notes",
  previewHint: "Starts empty. Whatever you type is saved with your layout.",
  schema: {
    title: titleProperty("Notes"),
    body: {
      kind: "longText",
      label: "Text",
      help: "The contents of the pad. This is saved with your layout, so it appears on every device you sign in to.",
      defaultValue: "",
      placeholder: "Anything you want to remember…",
      maxLength: 20000,
      group: "Content",
    },
    editableOnCanvas: {
      kind: "toggle",
      label: "Let me type straight into the widget",
      help: "When this is off the pad is read-only outside Nexus Studio, which stops accidental edits.",
      defaultValue: true,
      group: "Behaviour",
    },
    showWordCount: {
      kind: "toggle",
      label: "Show a word count",
      help: "Adds a small count at the bottom of the pad.",
      defaultValue: false,
      group: "Appearance",
    },
    font: {
      kind: "font",
      label: "Typeface",
      help: "“system” matches the rest of macOS. A monospaced face suits lists and code snippets.",
      defaultValue: "system",
      group: "Appearance",
    },
    textSize: {
      kind: "slider",
      label: "Text size",
      help: "Scales this pad only. Your system text size still applies on top of it.",
      defaultValue: 1,
      min: 0.8,
      max: 1.6,
      step: 0.1,
      group: "Appearance",
    },
  },
};
