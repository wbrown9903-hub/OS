import type { WidgetDefinition } from "@nexus/schemas";
import { refreshProperty, titleProperty } from "../helpers.js";

/**
 * Shows an inbound webhook's health. The address and secret are never displayed
 * here — they live in the connection settings, behind a deliberate reveal.
 */
export const webhookTriggerWidget: WidgetDefinition = {
  type: "automation.webhookTrigger",
  name: "Webhook",
  summary: "Whether an inbound webhook is arriving, and when it last did.",
  category: "Automation",
  icon: "arrow.down.left.circle",
  defaultSpan: { columns: 4, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  dataEndpoint: "/api/widgets/webhooks/status",
  defaultRefreshSeconds: 60,
  helpTopicId: "widget-webhook",
  previewHint: "The address and signing secret are never shown on a dashboard.",
  schema: {
    title: titleProperty("Webhook"),
    webhookName: {
      kind: "text",
      label: "Webhook",
      help: "The name you gave this webhook when you created it in Settings.",
      defaultValue: "",
      maxLength: 60,
      group: "Data",
    },
    description: {
      kind: "longText",
      label: "What it is for",
      help: "A note to your future self about what sends this and what it triggers.",
      defaultValue: "",
      maxLength: 400,
      group: "Content",
    },
    showLastDelivery: {
      kind: "toggle",
      label: "Show the last delivery",
      help: "Displays when a message last arrived and whether it was accepted.",
      defaultValue: true,
      group: "Appearance",
    },
    showRejectedCount: {
      kind: "toggle",
      label: "Show rejected deliveries",
      help: "Counts messages refused because the signature, freshness or delivery id check failed. A rising count is worth investigating.",
      defaultValue: true,
      group: "Appearance",
    },
    warnAfterQuietHours: {
      kind: "number",
      label: "Warn if nothing arrives for",
      help: "A silent webhook usually means a broken integration. Zero turns the warning off.",
      defaultValue: 24,
      min: 0,
      max: 720,
      step: 1,
      unit: "hours",
      group: "Behaviour",
    },
    refreshSeconds: refreshProperty(60),
  },
};
