import type { WidgetDefinition } from "@nexus/schemas";
import { compareToProperty, currencyProperty, refreshProperty, titleProperty } from "../helpers.js";

/** WooCommerce takings over a chosen period. */
export const wooRevenueWidget: WidgetDefinition = {
  type: "commerce.wooRevenue",
  name: "WooCommerce — revenue",
  summary: "Takings from your WooCommerce store over a period you choose.",
  category: "Commerce",
  icon: "chart.line.uptrend.xyaxis",
  defaultSpan: { columns: 4, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  requiresConnection: "woocommerce",
  dataEndpoint: "/api/widgets/woocommerce/revenue",
  defaultRefreshSeconds: 600,
  helpTopicId: "widget-woo-revenue",
  previewHint: "Shows “Not connected” until the store is linked.",
  schema: {
    title: titleProperty("Revenue"),
    store: {
      kind: "connection",
      label: "Store",
      help: "Which connected WooCommerce store this reads.",
      defaultValue: null,
      service: "woocommerce",
      group: "Data",
    },
    period: {
      kind: "select",
      label: "Period",
      help: "The window the figure covers.",
      defaultValue: "today",
      options: [
        { value: "today", label: "Today" },
        { value: "thisWeek", label: "This week" },
        { value: "thisMonth", label: "This month" },
        { value: "thisYear", label: "This year" },
      ],
      group: "Data",
    },
    compareTo: compareToProperty(),
    currencyDisplay: currencyProperty(),
    includeTax: {
      kind: "toggle",
      label: "Include tax",
      help: "Whether the figure is gross or net.",
      defaultValue: false,
      group: "Data",
    },
    includeShipping: {
      kind: "toggle",
      label: "Include shipping",
      help: "Shipping charged to the customer counts towards the figure when this is on.",
      defaultValue: false,
      group: "Data",
    },
    showChart: {
      kind: "toggle",
      label: "Show a chart",
      help: "Adds a small chart of the period under the figure.",
      defaultValue: true,
      group: "Appearance",
    },
    refreshSeconds: refreshProperty(600),
  },
};
