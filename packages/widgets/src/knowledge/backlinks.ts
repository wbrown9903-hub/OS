import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/** What links to the note you are looking at — the part people forget to check. */
export const backlinksWidget: WidgetDefinition = {
  type: "knowledge.backlinks",
  name: "Backlinks",
  summary: "Everything that points at the note you are reading.",
  category: "Knowledge",
  icon: "arrow.triangle.branch",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 2, rows: 2 },
  dataEndpoint: "/api/widgets/knowledge/backlinks",
  defaultRefreshSeconds: 300,
  helpTopicId: "widget-backlinks",
  previewHint: "Follows the note you have open unless you pin one below.",
  schema: {
    title: titleProperty("Linked from"),
    followSelection: {
      kind: "toggle",
      label: "Follow the note I am reading",
      help: "The widget updates as you move between notes. Turn it off to pin one note.",
      defaultValue: true,
      group: "Behaviour",
    },
    noteId: {
      kind: "text",
      label: "Pinned note",
      help: "The identifier of the note to keep showing links for.",
      defaultValue: "",
      maxLength: 80,
      group: "Data",
      visibleWhen: { property: "followSelection", equals: false },
    },
    depth: {
      kind: "slider",
      label: "How far to follow",
      help: "One level shows direct links. Two also shows what links to those, which grows quickly.",
      defaultValue: 1,
      min: 1,
      max: 3,
      step: 1,
      group: "Data",
    },
    count: countProperty("Links shown", 8, 30),
    includeUnlinkedMentions: {
      kind: "toggle",
      label: "Include mentions without a link",
      help: "Finds notes that name this one in plain text but never linked to it.",
      defaultValue: true,
      group: "Data",
    },
    emptyMessage: emptyMessageProperty("Nothing links here yet."),
    refreshSeconds: refreshProperty(300),
  },
};
