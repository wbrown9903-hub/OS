import type { WidgetDefinition } from "@nexus/schemas";
import { accentProperty, actionValue, imageValue } from "../helpers.js";

/**
 * The banner at the top of a RuneScape page.
 *
 * Everything about it is editable from the inspector: the wording, the artwork
 * (bundled original, an upload, a web address or the official feed), how strongly
 * the artwork is dimmed so text stays legible, and the two buttons.
 */
export const runescapeHeroWidget: WidgetDefinition = {
  type: "runescape.hero",
  name: "RuneScape banner",
  summary: "A large banner with your own wording, artwork and two buttons.",
  category: "Games",
  icon: "shield.lefthalf.filled",
  defaultSpan: { columns: 12, rows: 4 },
  minimumSpan: { columns: 6, rows: 2 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-runescape-hero",
  previewHint: "Ships with original Nexus artwork. Point it at the official feed or your own image whenever you like.",
  schema: {
    title: {
      kind: "text",
      label: "Heading",
      help: "The large wording across the banner. Keep it short so it stays on one line on a laptop.",
      defaultValue: "Gielinor awaits",
      maxLength: 60,
      group: "Content",
    },
    subtitle: {
      kind: "text",
      label: "Supporting line",
      help: "One line under the heading, for example today's plan or a reminder.",
      defaultValue: "Pick up where you left off.",
      maxLength: 140,
      group: "Content",
    },
    game: {
      kind: "select",
      label: "Game",
      help: "Which game this banner is about. “Both” shows Old School and RuneScape 3 side by side.",
      defaultValue: "osrs",
      options: [
        { value: "osrs", label: "Old School RuneScape", help: "OSRS worlds, news and stats." },
        { value: "rs3", label: "RuneScape 3", help: "RS3 worlds, news and stats." },
        { value: "both", label: "Both", help: "Show both games together." },
      ],
      group: "Content",
    },
    banner: {
      kind: "image",
      label: "Banner artwork",
      help: "Use bundled Nexus artwork, upload your own screenshot, paste a web address, or follow the official feed. Add alternative text so the banner works with VoiceOver.",
      defaultValue: imageValue({ builtInId: "nexus-gielinor-dusk", altText: "Abstract dusk landscape artwork" }),
      aspectHint: "Wide — roughly 3:1 looks best",
      group: "Appearance",
    },
    overlayStrength: {
      kind: "slider",
      label: "Darken the artwork",
      help: "Raises the dark wash over the artwork so the heading stays readable. Nexus Studio warns you if the wording would fail the contrast check.",
      defaultValue: 0.45,
      min: 0,
      max: 1,
      step: 0.05,
      group: "Appearance",
    },
    height: {
      kind: "slider",
      label: "Banner height",
      help: "Height in pixels at a regular window size. Nexus OS scales it down on smaller displays.",
      defaultValue: 260,
      min: 140,
      max: 460,
      step: 10,
      group: "Appearance",
    },
    accentColour: accentProperty(),
    primaryAction: {
      kind: "action",
      label: "Main button",
      help: "The prominent button. Choose what it does from the list — Nexus OS never runs a typed-in command.",
      defaultValue: actionValue({
        type: "launchApplication",
        target: "RuneScape",
        fallbackURL: "https://www.runescape.com/",
      }),
      group: "Behaviour",
    },
    primaryActionLabel: {
      kind: "text",
      label: "Main button wording",
      help: "The words on the main button, for example “Play now”.",
      defaultValue: "Play now",
      maxLength: 30,
      group: "Behaviour",
    },
    secondaryAction: {
      kind: "action",
      label: "Second button",
      help: "An optional quieter button beside the main one. Set it to “Do nothing” to hide it.",
      defaultValue: actionValue({ type: "openURL", target: "https://secure.runescape.com/m=news/" }),
      group: "Behaviour",
    },
    secondaryActionLabel: {
      kind: "text",
      label: "Second button wording",
      help: "The words on the second button.",
      defaultValue: "Latest news",
      maxLength: 30,
      group: "Behaviour",
    },
    showPlayerName: {
      kind: "toggle",
      label: "Show a player name",
      help: "Adds your display name to the banner. It is only shown, never sent anywhere.",
      defaultValue: false,
      group: "Content",
    },
    playerName: {
      kind: "text",
      label: "Player name",
      help: "The name shown on the banner.",
      defaultValue: "",
      maxLength: 12,
      group: "Content",
      visibleWhen: { property: "showPlayerName", equals: true },
    },
  },
};
