import type { WidgetDefinition } from "@nexus/schemas";
import { linkValue, openInProperty, titleProperty } from "../helpers.js";

/** A tidy grid of links the user chooses. The most-used widget in the product. */
export const quickLinksWidget: WidgetDefinition = {
  type: "essentials.quickLinks",
  name: "Quick links",
  summary: "A grid of the places you go most often.",
  category: "Essentials",
  icon: "link",
  defaultSpan: { columns: 4, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-quick-links",
  previewHint: "Add your own links — nothing is filled in for you.",
  schema: {
    title: titleProperty("Quick links"),
    links: {
      kind: "list",
      label: "Links",
      help: "Each row becomes one button. Drag rows to change the order they appear in.",
      defaultValue: [],
      itemLabel: "Link",
      itemSchema: {
        destination: {
          kind: "link",
          label: "Destination",
          help: "The address to open, and the words shown on the button.",
          defaultValue: linkValue(),
        },
        icon: {
          kind: "icon",
          label: "Icon",
          help: "A small symbol shown beside the label.",
          defaultValue: "arrow.up.right.square",
        },
      },
      group: "Content",
    },
    columns: {
      kind: "slider",
      label: "Columns",
      help: "How many links sit side by side before wrapping onto the next row.",
      defaultValue: 2,
      min: 1,
      max: 6,
      step: 1,
      group: "Appearance",
    },
    showIcons: {
      kind: "toggle",
      label: "Show icons",
      help: "Turn this off for a plain text list.",
      defaultValue: true,
      group: "Appearance",
    },
    openIn: openInProperty(),
  },
};
