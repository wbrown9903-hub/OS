import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/** Comments awaiting moderation. Moderation itself always confirms first. */
export const wordpressCommentsWidget: WidgetDefinition = {
  type: "commerce.wordpressComments",
  name: "WordPress — comments",
  summary: "Comments waiting for you, with the newest first.",
  category: "Commerce",
  icon: "text.bubble",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 3, rows: 2 },
  requiresConnection: "wordpress",
  dataEndpoint: "/api/widgets/wordpress/comments",
  defaultRefreshSeconds: 600,
  helpTopicId: "widget-wordpress-comments",
  previewHint: "Approving or deleting always asks you first.",
  schema: {
    title: titleProperty("Comments"),
    site: {
      kind: "connection",
      label: "Site",
      help: "Which connected WordPress site this reads.",
      defaultValue: null,
      service: "wordpress",
      group: "Data",
    },
    filter: {
      kind: "select",
      label: "Show",
      help: "Which comments to list.",
      defaultValue: "pending",
      options: [
        { value: "pending", label: "Waiting for moderation" },
        { value: "approved", label: "Approved" },
        { value: "spam", label: "Marked as spam" },
        { value: "all", label: "Everything" },
      ],
      group: "Data",
    },
    count: countProperty("Comments shown", 5, 25),
    showExcerpt: {
      kind: "toggle",
      label: "Show the comment text",
      help: "Turn this off to see only who commented on what.",
      defaultValue: true,
      group: "Appearance",
    },
    showPostTitle: {
      kind: "toggle",
      label: "Show which post",
      help: "Adds the post each comment belongs to.",
      defaultValue: true,
      group: "Appearance",
    },
    allowModeration: {
      kind: "toggle",
      label: "Let me approve or bin from here",
      help: "Adds approve and bin buttons. Both ask you to confirm, every time, even in a trusted workspace.",
      defaultValue: false,
      group: "Behaviour",
    },
    emptyMessage: emptyMessageProperty("No comments waiting."),
    refreshSeconds: refreshProperty(600),
  },
};
