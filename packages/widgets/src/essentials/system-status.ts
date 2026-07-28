import type { WidgetDefinition } from "@nexus/schemas";
import { refreshProperty, titleProperty } from "../helpers.js";

/** Live machine health from the Bridge. Shows "Not connected" rather than zeros. */
export const systemStatusWidget: WidgetDefinition = {
  type: "essentials.systemStatus",
  name: "System status",
  summary: "Processor, memory, disk and battery for this Mac.",
  category: "Essentials",
  icon: "gauge.with.dots.needle.33percent",
  defaultSpan: { columns: 4, rows: 2 },
  minimumSpan: { columns: 3, rows: 1 },
  requiresBridge: true,
  dataEndpoint: "/api/widgets/system-status",
  defaultRefreshSeconds: 30,
  helpTopicId: "widget-system-status",
  previewHint: "Reads real figures from your Mac through Nexus Desktop.",
  schema: {
    title: titleProperty("System"),
    metrics: {
      kind: "multiSelect",
      label: "What to show",
      help: "Each selected measure gets its own row.",
      defaultValue: ["cpu", "memory", "disk", "battery"],
      options: [
        { value: "cpu", label: "Processor" },
        { value: "memory", label: "Memory" },
        { value: "disk", label: "Disk space" },
        { value: "battery", label: "Battery" },
        { value: "network", label: "Network throughput" },
        { value: "uptime", label: "Uptime" },
      ],
      group: "Data",
    },
    display: {
      kind: "select",
      label: "Display as",
      help: "Bars are easier to scan; figures are more precise.",
      defaultValue: "bars",
      options: [
        { value: "bars", label: "Bars" },
        { value: "figures", label: "Figures" },
        { value: "both", label: "Bars and figures" },
      ],
      group: "Appearance",
    },
    warnAbovePercent: {
      kind: "slider",
      label: "Warn above",
      help: "A measure is marked as needing attention once it passes this percentage. The badge says so in words as well as colour.",
      defaultValue: 85,
      min: 50,
      max: 99,
      step: 1,
      group: "Behaviour",
    },
    refreshSeconds: refreshProperty(30),
  },
};
