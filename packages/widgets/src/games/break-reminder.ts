import type { WidgetDefinition } from "@nexus/schemas";
import { audioValue, titleProperty } from "../helpers.js";

/** Nudges the user to stand up. Respects quiet hours and reduced motion. */
export const breakReminderWidget: WidgetDefinition = {
  type: "games.breakReminder",
  name: "Break reminder",
  summary: "A gentle nudge to stand up and look away from the screen.",
  category: "Games",
  icon: "cup.and.saucer",
  defaultSpan: { columns: 3, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-break-reminder",
  previewHint: "Runs entirely on your own machine.",
  schema: {
    title: titleProperty("Take a break"),
    intervalMinutes: {
      kind: "duration",
      label: "Remind me every",
      help: "The gap between nudges while you are active.",
      defaultValue: 3000,
      min: 300,
      max: 14400,
      group: "Behaviour",
    },
    breakLengthMinutes: {
      kind: "duration",
      label: "Suggested break length",
      help: "Shown in the nudge, and used for the countdown if you accept it.",
      defaultValue: 300,
      min: 60,
      max: 3600,
      group: "Behaviour",
    },
    message: {
      kind: "text",
      label: "What the nudge says",
      help: "Your own wording. Something specific works better than “take a break”.",
      defaultValue: "Stand up, look out of the window for twenty seconds.",
      maxLength: 140,
      group: "Content",
    },
    snoozeMinutes: {
      kind: "duration",
      label: "Snooze for",
      help: "How long “not now” postpones the nudge.",
      defaultValue: 600,
      min: 60,
      max: 3600,
      group: "Behaviour",
    },
    respectQuietHours: {
      kind: "toggle",
      label: "Stay silent during quiet hours",
      help: "Uses the quiet hours set in your preferences, so nudges never interrupt a film or a call.",
      defaultValue: true,
      group: "Behaviour",
    },
    sound: {
      kind: "audio",
      label: "Nudge sound",
      help: "A quiet sound, or silence if you prefer a visual nudge only.",
      defaultValue: audioValue({ builtInId: "nexus-soft-bell", volume: 0.3 }),
      group: "Behaviour",
    },
  },
};
