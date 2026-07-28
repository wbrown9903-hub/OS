import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/** How the user's automations are doing, including the ones that failed quietly. */
export const workflowStatusWidget: WidgetDefinition = {
  type: "automation.workflowStatus",
  name: "Workflow status",
  summary: "Whether your automations ran, and what happened when they did.",
  category: "Automation",
  icon: "bolt.horizontal",
  defaultSpan: { columns: 6, rows: 3 },
  minimumSpan: { columns: 3, rows: 2 },
  dataEndpoint: "/api/widgets/workflows/status",
  defaultRefreshSeconds: 120,
  helpTopicId: "widget-workflow-status",
  previewHint: "Lists the workflows you have built. A failure is always explained in words.",
  schema: {
    title: titleProperty("Workflows"),
    scope: {
      kind: "select",
      label: "Which workflows",
      help: "Show everything, or only the ones you name below.",
      defaultValue: "all",
      options: [
        { value: "all", label: "All my workflows" },
        { value: "selected", label: "Only the ones I list" },
      ],
      group: "Data",
    },
    workflows: {
      kind: "list",
      label: "Workflows",
      help: "Each row names one workflow to watch.",
      defaultValue: [],
      itemLabel: "Workflow",
      itemSchema: {
        workflowId: {
          kind: "text",
          label: "Workflow",
          help: "The identifier shown on the workflow's own page.",
          defaultValue: "",
          maxLength: 80,
        },
        label: {
          kind: "text",
          label: "Name to show",
          help: "Optional friendlier name for the dashboard.",
          defaultValue: "",
          maxLength: 60,
        },
      },
      group: "Data",
      visibleWhen: { property: "scope", equals: "selected" },
    },
    failuresOnly: {
      kind: "toggle",
      label: "Only show problems",
      help: "Keeps the widget quiet until something needs you.",
      defaultValue: false,
      group: "Data",
    },
    showLastRun: {
      kind: "toggle",
      label: "Show when it last ran",
      help: "Adds “ran 12 min ago” to each row.",
      defaultValue: true,
      group: "Appearance",
    },
    showDuration: {
      kind: "toggle",
      label: "Show how long it took",
      help: "A run getting slower is often the first sign of trouble.",
      defaultValue: false,
      group: "Appearance",
      advanced: true,
    },
    count: countProperty("Workflows shown", 6, 25),
    emptyMessage: emptyMessageProperty("No workflows yet."),
    refreshSeconds: refreshProperty(120),
  },
};
