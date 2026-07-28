import type { WidgetDefinition } from "@nexus/schemas";
import { actionValue, titleProperty } from "../helpers.js";

/** The first-run guide. Each step carries a real action, never a dead tick box. */
export const onboardingChecklistWidget: WidgetDefinition = {
  type: "essentials.onboardingChecklist",
  name: "Setup checklist",
  summary: "The steps left to finish setting up Nexus OS.",
  category: "Essentials",
  icon: "checklist",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 3, rows: 2 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-onboarding",
  previewHint: "Every step opens the screen that completes it.",
  schema: {
    title: titleProperty("Finish setting up"),
    steps: {
      kind: "list",
      label: "Steps",
      help: "Each step needs a button that actually takes the person somewhere. A step with no action is not shown.",
      defaultValue: [
        {
          label: "Choose a theme",
          detail: "Pick the look of your desktop. You can change it whenever you like.",
          action: actionValue({ type: "openPanel", target: "studio/theme" }),
          done: false,
        },
        {
          label: "Connect a service",
          detail: "Connect Shopify, WordPress or an AI provider to see real information on your dashboard.",
          action: actionValue({ type: "openPanel", target: "settings/connections" }),
          done: false,
        },
        {
          label: "Install Nexus Desktop",
          detail: "The Mac app lets Nexus OS launch applications and arrange windows for you.",
          action: actionValue({ type: "openPanel", target: "settings/desktop" }),
          done: false,
        },
      ],
      itemLabel: "Step",
      itemSchema: {
        label: {
          kind: "text",
          label: "Step",
          help: "A short instruction, written as something to do.",
          defaultValue: "",
          maxLength: 80,
        },
        detail: {
          kind: "longText",
          label: "Explanation",
          help: "One or two sentences explaining why this step is worth doing.",
          defaultValue: "",
          maxLength: 400,
        },
        action: {
          kind: "action",
          label: "Button",
          help: "Where the button takes the person. Pick the screen that actually completes the step.",
          defaultValue: actionValue({ type: "openPanel" }),
        },
        done: {
          kind: "toggle",
          label: "Already done",
          help: "Ticked steps move to the bottom and stop being counted as outstanding.",
          defaultValue: false,
        },
      },
      group: "Content",
    },
    showProgress: {
      kind: "toggle",
      label: "Show progress",
      help: "Adds “2 of 5 done” above the list.",
      defaultValue: true,
      group: "Appearance",
    },
    hideWhenComplete: {
      kind: "toggle",
      label: "Hide when everything is done",
      help: "The widget removes itself from the page once every step is ticked. You can always add it back.",
      defaultValue: true,
      group: "Behaviour",
    },
  },
};
