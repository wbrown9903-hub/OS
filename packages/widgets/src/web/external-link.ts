import type { WidgetDefinition } from "@nexus/schemas";
import { imageValue, linkValue, openInProperty } from "../helpers.js";

/** A single, handsome link card. */
export const externalLinkWidget: WidgetDefinition = {
  type: "web.externalLink",
  name: "Link card",
  summary: "One link, presented as a proper card rather than a line of text.",
  category: "Web",
  icon: "arrow.up.right.square",
  defaultSpan: { columns: 3, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-link-card",
  previewHint: "Addresses are checked before anything is opened or fetched.",
  schema: {
    destination: {
      kind: "link",
      label: "Destination",
      help: "Where the card goes, and the words shown on it.",
      defaultValue: linkValue({ label: "Open" }),
      group: "Content",
    },
    description: {
      kind: "text",
      label: "Description",
      help: "One line explaining what is at the other end.",
      defaultValue: "",
      maxLength: 140,
      group: "Content",
    },
    artwork: {
      kind: "image",
      label: "Artwork",
      help: "Optional picture for the card. Bundled Nexus artwork is used unless you choose otherwise.",
      defaultValue: imageValue({ builtInId: "nexus-abstract-01", altText: "" }),
      aspectHint: "Wide — roughly 2:1",
      group: "Appearance",
    },
    showFavicon: {
      kind: "toggle",
      label: "Show the site's icon",
      help: "Fetches the site's own small icon. Turn this off if you would rather nothing was requested from the site.",
      defaultValue: true,
      group: "Appearance",
    },
    openIn: openInProperty(),
  },
};
