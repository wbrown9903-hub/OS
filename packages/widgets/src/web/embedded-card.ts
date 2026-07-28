import type { WidgetDefinition } from "@nexus/schemas";
import { refreshProperty, titleProperty } from "../helpers.js";

/**
 * A web page shown inside the dashboard where the site permits it.
 *
 * Many sites refuse to be framed, using X-Frame-Options or a frame-ancestors
 * policy. That is the site's decision and Nexus OS respects it: when a page
 * cannot be embedded the widget shows a proper card with the page's own details
 * and a button to open it in the browser or the matching app. There is no
 * proxying, no header stripping and no attempt to work around the refusal.
 */
export const embeddedWebCardWidget: WidgetDefinition = {
  type: "web.embeddedCard",
  name: "Web page",
  summary: "A web page in your dashboard, or a proper card when the site declines to be embedded.",
  category: "Web",
  icon: "safari",
  defaultSpan: { columns: 6, rows: 4 },
  minimumSpan: { columns: 3, rows: 2 },
  defaultRefreshSeconds: 0,
  helpTopicId: "widget-embedded-web",
  previewHint: "Sites that refuse embedding get a polished card instead — never a blank rectangle.",
  schema: {
    title: titleProperty("Web page"),
    url: {
      kind: "url",
      label: "Address",
      help: "The page to show. Only https addresses are allowed, and private or local addresses are refused.",
      defaultValue: "",
      group: "Content",
    },
    attemptEmbed: {
      kind: "toggle",
      label: "Try to show the page here",
      help: "Many sites — banks, Google, most dashboards — refuse to be embedded. When that happens you get a card with a button instead, which is often nicer anyway.",
      defaultValue: true,
      group: "Behaviour",
    },
    fallbackAction: {
      kind: "select",
      label: "When the site declines",
      help: "What the card offers when the page cannot be embedded.",
      defaultValue: "openInBrowser",
      options: [
        { value: "openInBrowser", label: "Open in my browser" },
        { value: "openInApp", label: "Open in the matching Mac app" },
        { value: "openInPanel", label: "Open in a Nexus OS panel" },
      ],
      group: "Behaviour",
    },
    height: {
      kind: "slider",
      label: "Height",
      help: "How tall the embedded area is, in pixels at a regular window size.",
      defaultValue: 320,
      min: 160,
      max: 900,
      step: 20,
      group: "Appearance",
    },
    showAddress: {
      kind: "toggle",
      label: "Show the address",
      help: "Displays the address above the page, so you can always see where content came from.",
      defaultValue: true,
      group: "Appearance",
    },
    reloadOnFocus: {
      kind: "toggle",
      label: "Reload when I come back to this page",
      help: "Keeps the content current without a timer running in the background.",
      defaultValue: false,
      group: "Behaviour",
    },
    refreshSeconds: refreshProperty(900),
  },
};
