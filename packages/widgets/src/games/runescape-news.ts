import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/** The official news feed, read-only, with the source and time always shown. */
export const runescapeNewsWidget: WidgetDefinition = {
  type: "runescape.news",
  name: "RuneScape news",
  summary: "Official game news and update posts.",
  category: "Games",
  icon: "newspaper",
  defaultSpan: { columns: 6, rows: 4 },
  minimumSpan: { columns: 3, rows: 2 },
  requiresConnection: "runescape",
  dataEndpoint: "/api/widgets/runescape/news",
  defaultRefreshSeconds: 900,
  helpTopicId: "widget-runescape-news",
  previewHint: "Reads the official public feed. Nothing is posted on your behalf.",
  schema: {
    title: titleProperty("RuneScape news"),
    game: {
      kind: "select",
      label: "Feed",
      help: "Which official feed to read.",
      defaultValue: "osrs",
      options: [
        { value: "osrs", label: "Old School RuneScape" },
        { value: "rs3", label: "RuneScape 3" },
        { value: "both", label: "Both, newest first" },
      ],
      group: "Data",
    },
    count: countProperty("Stories to show", 5, 15),
    categories: {
      kind: "multiSelect",
      label: "Kinds of post",
      help: "Only these kinds of post are listed. Leave everything ticked to see the full feed.",
      defaultValue: ["gameUpdate", "communityUpdate", "behindTheScenes", "patchNotes"],
      options: [
        { value: "gameUpdate", label: "Game updates" },
        { value: "communityUpdate", label: "Community" },
        { value: "behindTheScenes", label: "Behind the scenes" },
        { value: "patchNotes", label: "Patch notes" },
        { value: "events", label: "Events" },
      ],
      group: "Data",
    },
    showImages: {
      kind: "toggle",
      label: "Show thumbnails",
      help: "Images come from the official feed and are checked before they are displayed.",
      defaultValue: true,
      group: "Appearance",
    },
    showSummaries: {
      kind: "toggle",
      label: "Show summaries",
      help: "Adds the first couple of lines of each post under its heading.",
      defaultValue: true,
      group: "Appearance",
    },
    openIn: {
      kind: "select",
      label: "Open stories in",
      help: "Where a story opens when you choose it.",
      defaultValue: "browser",
      options: [
        { value: "browser", label: "Your browser" },
        { value: "panel", label: "A reading panel inside Nexus OS" },
      ],
      group: "Behaviour",
    },
    emptyMessage: emptyMessageProperty("No stories in the feed right now."),
    refreshSeconds: refreshProperty(900),
  },
};
