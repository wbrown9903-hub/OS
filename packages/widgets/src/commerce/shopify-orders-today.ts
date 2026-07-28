import type { WidgetDefinition } from "@nexus/schemas";
import { compareToProperty, refreshProperty, titleProperty } from "../helpers.js";

/** How many orders arrived today, as a count rather than a value. */
export const shopifyOrdersTodayWidget: WidgetDefinition = {
  type: "commerce.shopifyOrdersToday",
  name: "Shopify — orders today",
  summary: "How many orders have come in today.",
  category: "Commerce",
  icon: "cart",
  defaultSpan: { columns: 3, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  requiresConnection: "shopify",
  dataEndpoint: "/api/widgets/shopify/orders-today",
  defaultRefreshSeconds: 300,
  helpTopicId: "widget-shopify-orders",
  previewHint: "A count of real orders, or “Not connected”.",
  schema: {
    title: titleProperty("Orders today"),
    shop: {
      kind: "connection",
      label: "Shop",
      help: "Which connected Shopify shop this reads.",
      defaultValue: null,
      service: "shopify",
      group: "Data",
    },
    compareTo: compareToProperty(),
    countCancelled: {
      kind: "toggle",
      label: "Count cancelled orders",
      help: "Leave this off to count only orders that still stand.",
      defaultValue: false,
      group: "Data",
    },
    breakdownBy: {
      kind: "select",
      label: "Break the total down by",
      help: "Adds a small breakdown under the headline count.",
      defaultValue: "none",
      options: [
        { value: "none", label: "No breakdown" },
        { value: "channel", label: "Sales channel" },
        { value: "country", label: "Country" },
        { value: "fulfilment", label: "Fulfilment status" },
      ],
      group: "Appearance",
    },
    refreshSeconds: refreshProperty(300),
  },
};
