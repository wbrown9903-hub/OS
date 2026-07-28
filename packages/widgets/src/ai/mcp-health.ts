import type { WidgetDefinition } from "@nexus/schemas";
import { emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/** Health of connected MCP servers, including which tools each one exposes. */
export const mcpHealthWidget: WidgetDefinition = {
  type: "ai.mcpHealth",
  name: "MCP servers",
  summary: "Whether each connected tool server is reachable, and what it offers.",
  category: "AI",
  icon: "antenna.radiowaves.left.and.right",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 3, rows: 2 },
  requiresConnection: "mcp",
  dataEndpoint: "/api/widgets/mcp/health",
  defaultRefreshSeconds: 120,
  helpTopicId: "widget-mcp-health",
  previewHint: "Lists the servers you have added in the MCP centre.",
  schema: {
    title: titleProperty("MCP servers"),
    problemsOnly: {
      kind: "toggle",
      label: "Only show servers needing attention",
      help: "Hides healthy servers so the widget stays quiet until something breaks.",
      defaultValue: false,
      group: "Data",
    },
    showToolCounts: {
      kind: "toggle",
      label: "Show how many tools each offers",
      help: "A sudden change in tool count is worth noticing — it means the server changed what it can do.",
      defaultValue: true,
      group: "Appearance",
    },
    showPermissionState: {
      kind: "toggle",
      label: "Show what each server is allowed to do",
      help: "Displays whether tools run automatically or ask you first.",
      defaultValue: true,
      group: "Appearance",
    },
    nameFilter: {
      kind: "text",
      label: "Only servers matching",
      help: "Leave empty for all servers. Otherwise only names containing this text are listed.",
      defaultValue: "",
      maxLength: 60,
      group: "Data",
      advanced: true,
    },
    emptyMessage: emptyMessageProperty("No MCP servers added yet."),
    refreshSeconds: refreshProperty(120),
  },
};
