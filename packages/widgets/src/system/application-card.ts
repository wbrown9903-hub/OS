import type { WidgetDefinition } from "@nexus/schemas";
import { actionValue, imageValue } from "../helpers.js";

/**
 * One application, in whichever state it is really in: installed, not installed,
 * or available on the web only. It never pretends an app is there.
 */
export const applicationCardWidget: WidgetDefinition = {
  type: "system.applicationCard",
  name: "Application card",
  summary: "One app, with an honest installed / not installed / web-only state.",
  category: "System",
  icon: "app.badge",
  defaultSpan: { columns: 3, rows: 2 },
  minimumSpan: { columns: 2, rows: 1 },
  requiresBridge: true,
  dataEndpoint: "/api/widgets/applications/state",
  defaultRefreshSeconds: 600,
  helpTopicId: "widget-application-card",
  previewHint: "Without Nexus Desktop the card still offers the web version, and says why.",
  schema: {
    applicationName: {
      kind: "text",
      label: "Application",
      help: "The name as it appears in your Applications folder.",
      defaultValue: "",
      maxLength: 60,
      group: "Content",
    },
    bundleIdentifier: {
      kind: "text",
      label: "Bundle identifier",
      help: "Optional but more reliable than the name, for example com.apple.Safari.",
      defaultValue: "",
      maxLength: 120,
      group: "Data",
      advanced: true,
    },
    artwork: {
      kind: "image",
      label: "Icon or artwork",
      help: "Used until Nexus Desktop can read the real app icon from your Mac.",
      defaultValue: imageValue({ builtInId: "nexus-app-tile", altText: "Application tile artwork" }),
      aspectHint: "Square",
      group: "Appearance",
    },
    launch: {
      kind: "action",
      label: "When the card is chosen",
      help: "Normally “Launch application”. Add a web address as the fallback so the card still works when the app is missing.",
      defaultValue: actionValue({ type: "launchApplication" }),
      group: "Behaviour",
    },
    installURL: {
      kind: "url",
      label: "Where to get it",
      help: "Shown when the app is not installed, so the card offers a way forward instead of a dead end.",
      defaultValue: "",
      group: "Behaviour",
    },
    webVersionURL: {
      kind: "url",
      label: "Web version",
      help: "Offered when there is no Mac app, or when Nexus Desktop is not running.",
      defaultValue: "",
      group: "Behaviour",
    },
    showVersion: {
      kind: "toggle",
      label: "Show the installed version",
      help: "Adds the version Nexus Desktop found on this Mac.",
      defaultValue: false,
      group: "Appearance",
    },
  },
};
