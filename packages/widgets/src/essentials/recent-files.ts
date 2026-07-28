import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/** Recently used documents, read by the Mac Bridge. Never guesses when offline. */
export const recentFilesWidget: WidgetDefinition = {
  type: "essentials.recentFiles",
  name: "Recent files",
  summary: "Documents you opened recently on this Mac.",
  category: "Essentials",
  icon: "clock.arrow.circlepath",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 3, rows: 2 },
  requiresBridge: true,
  requiresPermission: "files",
  dataEndpoint: "/api/widgets/recent-files",
  defaultRefreshSeconds: 120,
  helpTopicId: "widget-recent-files",
  previewHint: "Needs Nexus Desktop running, and permission to read your recent documents.",
  schema: {
    title: titleProperty("Recent files"),
    count: countProperty("Files to show", 6, 20),
    fileKinds: {
      kind: "multiSelect",
      label: "Kinds of file",
      help: "Only these kinds appear. Leave everything selected to see all recent documents.",
      defaultValue: ["documents", "images", "code", "design"],
      options: [
        { value: "documents", label: "Documents" },
        { value: "images", label: "Images" },
        { value: "code", label: "Code" },
        { value: "design", label: "Design files" },
        { value: "audio", label: "Audio" },
        { value: "video", label: "Video" },
        { value: "archives", label: "Archives" },
      ],
      group: "Data",
    },
    showFolder: {
      kind: "toggle",
      label: "Show the folder",
      help: "Adds the containing folder under each file name, which helps when names repeat.",
      defaultValue: true,
      group: "Appearance",
    },
    showModified: {
      kind: "toggle",
      label: "Show when it changed",
      help: "Adds “2 h ago” style timing to each row.",
      defaultValue: true,
      group: "Appearance",
    },
    emptyMessage: emptyMessageProperty("No recent files yet."),
    refreshSeconds: refreshProperty(120),
  },
};
