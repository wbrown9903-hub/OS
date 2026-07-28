import type { WidgetDefinition } from "@nexus/schemas";
import { accentProperty } from "../helpers.js";

/** Time, date and any number of extra time zones. Needs nothing to work. */
export const clockWidget: WidgetDefinition = {
  type: "essentials.clock",
  name: "Clock",
  summary: "The time and date, plus any other time zones you care about.",
  category: "Essentials",
  icon: "clock",
  defaultSpan: { columns: 3, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-clock",
  previewHint: "Shows your Mac's time immediately — nothing to connect.",
  schema: {
    style: {
      kind: "select",
      label: "Style",
      help: "How the time is drawn. All three read the same clock.",
      defaultValue: "digital",
      options: [
        { value: "digital", label: "Digital", help: "Large numerals." },
        { value: "minimal", label: "Minimal", help: "Small, quiet text." },
        { value: "wordy", label: "In words", help: "“Twenty past four”." },
      ],
      group: "Appearance",
    },
    hourFormat: {
      kind: "select",
      label: "Hour format",
      help: "Follow your Mac's setting, or force 12-hour or 24-hour time here.",
      defaultValue: "system",
      options: [
        { value: "system", label: "Follow macOS" },
        { value: "12", label: "12-hour (4:20 pm)" },
        { value: "24", label: "24-hour (16:20)" },
      ],
      group: "Appearance",
    },
    showSeconds: {
      kind: "toggle",
      label: "Show seconds",
      help: "Seconds update every second, which uses slightly more battery on a laptop.",
      defaultValue: false,
      group: "Appearance",
    },
    showDate: {
      kind: "toggle",
      label: "Show the date",
      help: "Adds the weekday and date under the time.",
      defaultValue: true,
      group: "Appearance",
    },
    dateFormat: {
      kind: "select",
      label: "Date format",
      help: "How the date is written out.",
      defaultValue: "long",
      options: [
        { value: "long", label: "Monday 3 March" },
        { value: "short", label: "Mon 3 Mar" },
        { value: "numeric", label: "03/03/2026" },
      ],
      group: "Appearance",
      visibleWhen: { property: "showDate", equals: true },
    },
    extraZones: {
      kind: "list",
      label: "Other time zones",
      help: "Add a row for each place you work with. Useful when a colleague or a game update is in another country.",
      defaultValue: [],
      itemLabel: "Time zone",
      itemSchema: {
        label: {
          kind: "text",
          label: "Label",
          help: "What to call this row, for example “Jagex (London)”.",
          defaultValue: "",
          maxLength: 40,
        },
        timeZone: {
          kind: "text",
          label: "Time zone",
          help: "An IANA name such as Europe/London or America/New_York.",
          defaultValue: "Europe/London",
          maxLength: 60,
        },
      },
      group: "Content",
    },
    accentColour: accentProperty(),
  },
};
