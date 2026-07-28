import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/** Notes touched recently, so the thread of work is easy to pick back up. */
export const recentNotesWidget: WidgetDefinition = {
  type: "knowledge.recentNotes",
  name: "Recent notes",
  summary: "The notes you worked on most recently.",
  category: "Knowledge",
  icon: "note",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 2, rows: 2 },
  dataEndpoint: "/api/widgets/knowledge/recent-notes",
  defaultRefreshSeconds: 120,
  helpTopicId: "widget-recent-notes",
  previewHint: "Lists real notes from your Brain.",
  schema: {
    title: titleProperty("Recent notes"),
    count: countProperty("Notes shown", 6, 25),
    sortBy: {
      kind: "select",
      label: "Order by",
      help: "Which timestamp decides the order.",
      defaultValue: "updated",
      options: [
        { value: "updated", label: "Last changed" },
        { value: "created", label: "Created" },
        { value: "opened", label: "Last opened" },
        { value: "title", label: "Title" },
      ],
      group: "Data",
    },
    tagFilter: {
      kind: "text",
      label: "Only notes tagged",
      help: "Leave empty for everything. Separate several tags with commas.",
      defaultValue: "",
      maxLength: 120,
      group: "Data",
    },
    showPreview: {
      kind: "toggle",
      label: "Show the first line",
      help: "Adds the opening line of each note under its title.",
      defaultValue: true,
      group: "Appearance",
    },
    showTags: {
      kind: "toggle",
      label: "Show tags",
      help: "Displays each note's tags as small labels.",
      defaultValue: true,
      group: "Appearance",
    },
    emptyMessage: emptyMessageProperty("No notes yet."),
    refreshSeconds: refreshProperty(120),
  },
};
