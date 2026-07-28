import type { WidgetDefinition } from "@nexus/schemas";
import { actionValue } from "../helpers.js";

/** One button that runs one workflow, with the result shown honestly afterwards. */
export const workflowRunButtonWidget: WidgetDefinition = {
  type: "automation.workflowRunButton",
  name: "Run a workflow",
  summary: "A single button that runs one of your workflows.",
  category: "Automation",
  icon: "play.circle",
  defaultSpan: { columns: 3, rows: 1 },
  minimumSpan: { columns: 2, rows: 1 },
  dataEndpoint: "/api/widgets/workflows/last-run",
  defaultRefreshSeconds: 60,
  helpTopicId: "widget-workflow-run",
  previewHint: "Only runs when you press it. Nothing runs on its own.",
  schema: {
    label: {
      kind: "text",
      label: "Button wording",
      help: "What the button says. Describe the outcome, for example “Send today's summary”.",
      defaultValue: "Run workflow",
      maxLength: 40,
      group: "Content",
    },
    run: {
      kind: "action",
      label: "What it runs",
      help: "Choose “Run workflow” and pick which one. Nexus OS will not run a typed-in command.",
      defaultValue: actionValue({ type: "runWorkflow", confirmationRequired: true }),
      group: "Behaviour",
    },
    icon: {
      kind: "icon",
      label: "Icon",
      help: "A symbol shown on the button.",
      defaultValue: "play.circle",
      group: "Appearance",
    },
    style: {
      kind: "select",
      label: "Button style",
      help: "How prominent the button should be.",
      defaultValue: "prominent",
      options: [
        { value: "prominent", label: "Prominent" },
        { value: "quiet", label: "Quiet" },
        { value: "destructive", label: "Careful — this one changes things" },
      ],
      group: "Appearance",
    },
    showLastResult: {
      kind: "toggle",
      label: "Show the last result",
      help: "Displays what happened last time, including the reason for any failure.",
      defaultValue: true,
      group: "Appearance",
    },
    cooldownSeconds: {
      kind: "duration",
      label: "Wait between runs",
      help: "Stops an accidental double press from running the workflow twice.",
      defaultValue: 30,
      min: 0,
      max: 3600,
      group: "Behaviour",
      advanced: true,
    },
  },
};
