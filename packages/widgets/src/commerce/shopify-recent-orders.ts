import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, densityProperty, emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/** The latest orders. Customer names can be masked for shared screens. */
export const shopifyRecentOrdersWidget: WidgetDefinition = {
  type: "commerce.shopifyRecentOrders",
  name: "Shopify — recent orders",
  summary: "The latest orders, newest first.",
  category: "Commerce",
  icon: "list.bullet.rectangle",
  defaultSpan: { columns: 6, rows: 4 },
  minimumSpan: { columns: 3, rows: 2 },
  requiresConnection: "shopify",
  dataEndpoint: "/api/widgets/shopify/recent-orders",
  defaultRefreshSeconds: 180,
  helpTopicId: "widget-shopify-recent-orders",
  previewHint: "Reads real orders. Nothing is shown until the shop is connected.",
  schema: {
    title: titleProperty("Recent orders"),
    shop: {
      kind: "connection",
      label: "Shop",
      help: "Which connected Shopify shop this reads.",
      defaultValue: null,
      service: "shopify",
      group: "Data",
    },
    count: countProperty("Orders shown", 8, 25),
    statuses: {
      kind: "multiSelect",
      label: "Only these statuses",
      help: "Limit the list to the states you actually act on.",
      defaultValue: ["paid", "pending", "partiallyFulfilled"],
      options: [
        { value: "paid", label: "Paid" },
        { value: "pending", label: "Payment pending" },
        { value: "partiallyFulfilled", label: "Partly fulfilled" },
        { value: "fulfilled", label: "Fulfilled" },
        { value: "refunded", label: "Refunded" },
        { value: "cancelled", label: "Cancelled" },
      ],
      group: "Data",
    },
    showItems: {
      kind: "toggle",
      label: "Show what was bought",
      help: "Adds the first few line items under each order.",
      defaultValue: true,
      group: "Appearance",
    },
    maskCustomerNames: {
      kind: "toggle",
      label: "Hide customer names",
      help: "Shows “J. S.” instead of the full name. Worth turning on if this dashboard is ever on a shared screen.",
      defaultValue: false,
      group: "Behaviour",
    },
    density: densityProperty(),
    emptyMessage: emptyMessageProperty("No orders in this period."),
    refreshSeconds: refreshProperty(180),
  },
};
