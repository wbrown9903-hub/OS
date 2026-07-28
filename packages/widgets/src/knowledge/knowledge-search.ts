import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, titleProperty } from "../helpers.js";

/** Search across everything the user has written or saved. */
export const knowledgeSearchWidget: WidgetDefinition = {
  type: "knowledge.search",
  name: "Knowledge search",
  summary: "Search your notes, files and saved pages in one place.",
  category: "Knowledge",
  icon: "magnifyingglass.circle",
  defaultSpan: { columns: 6, rows: 3 },
  minimumSpan: { columns: 3, rows: 2 },
  dataEndpoint: "/api/widgets/knowledge/search",
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-knowledge-search",
  previewHint: "Searches only what you have added to your Brain.",
  schema: {
    title: titleProperty("Search my knowledge"),
    placeholder: {
      kind: "text",
      label: "Placeholder text",
      help: "The greyed-out prompt in the search field.",
      defaultValue: "Search notes, files and saved pages…",
      maxLength: 80,
      group: "Content",
    },
    scopes: {
      kind: "multiSelect",
      label: "Search in",
      help: "Only the sources you tick are searched.",
      defaultValue: ["notes", "files", "savedPages"],
      options: [
        { value: "notes", label: "Notes" },
        { value: "files", label: "Indexed files" },
        { value: "savedPages", label: "Saved web pages" },
        { value: "conversations", label: "AI conversations" },
        { value: "workflows", label: "Workflow notes" },
      ],
      group: "Data",
    },
    matching: {
      kind: "select",
      label: "Matching",
      help: "Exact matching finds your words; related matching also finds things worded differently.",
      defaultValue: "related",
      options: [
        { value: "exact", label: "Exact words" },
        { value: "related", label: "Related meaning as well" },
      ],
      group: "Data",
    },
    count: countProperty("Results shown", 6, 25),
    showSnippets: {
      kind: "toggle",
      label: "Show matching lines",
      help: "Displays the sentence each result matched on, which saves opening it to check.",
      defaultValue: true,
      group: "Appearance",
    },
    shortcut: {
      kind: "shortcut",
      label: "Keyboard shortcut",
      help: "Jump straight into this search field from anywhere.",
      defaultValue: "",
      group: "Behaviour",
      advanced: true,
    },
  },
};
