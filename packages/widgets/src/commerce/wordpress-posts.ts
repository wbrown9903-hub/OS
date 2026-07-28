import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/** Posts and drafts, so unfinished writing does not get forgotten. */
export const wordpressPostsWidget: WidgetDefinition = {
  type: "commerce.wordpressPosts",
  name: "WordPress — posts and drafts",
  summary: "What is published, scheduled and still in draft.",
  category: "Commerce",
  icon: "doc.text",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 3, rows: 2 },
  requiresConnection: "wordpress",
  dataEndpoint: "/api/widgets/wordpress/posts",
  defaultRefreshSeconds: 600,
  helpTopicId: "widget-wordpress-posts",
  previewHint: "Lists real posts from the connected site.",
  schema: {
    title: titleProperty("Posts"),
    site: {
      kind: "connection",
      label: "Site",
      help: "Which connected WordPress site this reads.",
      defaultValue: null,
      service: "wordpress",
      group: "Data",
    },
    statuses: {
      kind: "multiSelect",
      label: "Include",
      help: "Which states to list. Drafts first is a good way to see what is unfinished.",
      defaultValue: ["draft", "scheduled", "published"],
      options: [
        { value: "draft", label: "Drafts" },
        { value: "pending", label: "Pending review" },
        { value: "scheduled", label: "Scheduled" },
        { value: "published", label: "Published" },
      ],
      group: "Data",
    },
    count: countProperty("Posts shown", 6, 25),
    showAuthor: {
      kind: "toggle",
      label: "Show the author",
      help: "Useful when more than one person writes for the site.",
      defaultValue: false,
      group: "Appearance",
    },
    showDate: {
      kind: "toggle",
      label: "Show the date",
      help: "Published date, or the scheduled date for anything not out yet.",
      defaultValue: true,
      group: "Appearance",
    },
    emptyMessage: emptyMessageProperty("No posts match these filters."),
    refreshSeconds: refreshProperty(600),
  },
};
