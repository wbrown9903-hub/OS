import type { WidgetDefinition } from "@nexus/schemas";
import { refreshProperty, titleProperty } from "../helpers.js";

/** Whether a WordPress site is up, patched and safe. */
export const wordpressSiteStatusWidget: WidgetDefinition = {
  type: "commerce.wordpressSiteStatus",
  name: "WordPress — site status",
  summary: "Whether the site is up, patched and in date.",
  category: "Commerce",
  icon: "globe",
  defaultSpan: { columns: 4, rows: 2 },
  minimumSpan: { columns: 3, rows: 1 },
  requiresConnection: "wordpress",
  dataEndpoint: "/api/widgets/wordpress/status",
  defaultRefreshSeconds: 600,
  helpTopicId: "widget-wordpress-status",
  previewHint: "Checks are read-only. Nexus OS never updates your site on its own.",
  schema: {
    title: titleProperty("Site status"),
    site: {
      kind: "connection",
      label: "Site",
      help: "Which connected WordPress site this reads.",
      defaultValue: null,
      service: "wordpress",
      group: "Data",
    },
    checks: {
      kind: "multiSelect",
      label: "Checks",
      help: "Each ticked check gets its own row with a plain-language result.",
      defaultValue: ["reachable", "ssl", "coreUpdates", "pluginUpdates"],
      options: [
        { value: "reachable", label: "Site responds" },
        { value: "ssl", label: "Certificate valid" },
        { value: "coreUpdates", label: "WordPress up to date" },
        { value: "pluginUpdates", label: "Plugins up to date" },
        { value: "phpVersion", label: "Supported PHP version" },
        { value: "backups", label: "Recent backup" },
      ],
      group: "Data",
    },
    sslWarningDays: {
      kind: "number",
      label: "Warn about the certificate",
      help: "How many days before expiry to start warning you.",
      defaultValue: 21,
      min: 1,
      max: 120,
      step: 1,
      unit: "days before expiry",
      group: "Behaviour",
    },
    showResponseTime: {
      kind: "toggle",
      label: "Show response time",
      help: "Adds how long the site took to answer the last check.",
      defaultValue: true,
      group: "Appearance",
    },
    refreshSeconds: refreshProperty(600),
  },
};
