import type { WidgetDefinition } from "@nexus/schemas";
import { audioValue, titleProperty } from "../helpers.js";

/** A timer for the current play session, with an honest "not started" state. */
export const playSessionWidget: WidgetDefinition = {
  type: "games.playSession",
  name: "Play session timer",
  summary: "How long this session has run, against a goal you set.",
  category: "Games",
  icon: "timer",
  defaultSpan: { columns: 3, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-play-session",
  previewHint: "Counts only while you have it running. Nothing is tracked in the background.",
  schema: {
    title: titleProperty("Session"),
    goalMinutes: {
      kind: "duration",
      label: "Session goal",
      help: "The length you are aiming for. The ring fills as you approach it.",
      defaultValue: 3600,
      min: 300,
      max: 43200,
      group: "Behaviour",
    },
    autoStartWithGame: {
      kind: "toggle",
      label: "Start when the game launches",
      help: "Needs Nexus Desktop, which tells Nexus OS when the game window appears. Without it, start the timer yourself.",
      defaultValue: false,
      group: "Behaviour",
    },
    warnAtPercent: {
      kind: "slider",
      label: "Give me a nudge at",
      help: "A quiet nudge once you reach this share of the goal.",
      defaultValue: 80,
      min: 25,
      max: 100,
      step: 5,
      group: "Behaviour",
    },
    chime: {
      kind: "audio",
      label: "Sound when the goal is reached",
      help: "Choose “silent” if you would rather see the change than hear it.",
      defaultValue: audioValue({ builtInId: "nexus-soft-bell", volume: 0.4 }),
      group: "Behaviour",
    },
    showTotalToday: {
      kind: "toggle",
      label: "Show today's total",
      help: "Adds the total across all of today's sessions under the timer.",
      defaultValue: true,
      group: "Appearance",
    },
  },
};
