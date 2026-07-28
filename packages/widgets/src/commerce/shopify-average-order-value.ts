import type { WidgetDefinition } from "@nexus/schemas";
import { compareToProperty, currencyProperty, refreshProperty, titleProperty } from "../helpers.js";

/** Average order value over a chosen window. */
export const shopifyAverageOrderValueWidget: WidgetDefinition = {
  type: "commerce.shopifyAverageOrderValue",
  name: "Shopify — average order value",
  summary: "What a typical order is worth over the period you choose.",
  category: "Commerce",
  icon: "chart.bar",
  defaultSpan: { columns: 3, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  requiresConnection: "shopify",
  dataEndpoint: "/api/widgets/shopify/average-order-value",
  defaultRefreshSeconds: 900,
  helpTopicId: "widget-shopify-aov",
  previewHint: "Calculated from real orders in the chosen window.",
  schema: {
    title: titleProperty("Average order"),
    shop: {
      kind: "connection",
      label: "Shop",
      help: "Which connected Shopify shop this reads.",
      defaultValue: null,
      service: "shopify",
      group: "Data",
    },
    period: {
      kind: "select",
      label: "Period",
      help: "A longer window is steadier; a shorter one reacts faster to a promotion.",
      defaultValue: "last7Days",
      options: [
        { value: "today", label: "Today" },
        { value: "last7Days", label: "Last 7 days" },
        { value: "last30Days", label: "Last 30 days" },
        { value: "last90Days", label: "Last 90 days" },
      ],
      group: "Data",
    },
    compareTo: compareToProperty(),
    currencyDisplay: currencyProperty(),
    excludeRefunded: {
      kind: "toggle",
      label: "Exclude refunded orders",
      help: "Refunds pull the average down. Excluding them shows what customers intended to spend.",
      defaultValue: true,
      group: "Data",
    },
    refreshSeconds: refreshProperty(900),
  },
};
