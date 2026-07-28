import type { PropertySchema, WidgetDefinition } from "@nexus/schemas";
import { WidgetRegistry } from "@nexus/schemas";

/**
 * The core widget catalogue.
 *
 * A widget is one declaration. From it the Studio inspector, the zod validator,
 * the defaults, the reset behaviour, the gallery entry and the contextual help are
 * all derived — there is no per-widget editor code anywhere.
 *
 * This module is the catalogue the API serves today. When `packages/widgets`
 * lands with rendering components, its definitions replace these; the shape does
 * not change, because the shape is `WidgetDefinition` from `@nexus/schemas`.
 */

const headingProperty: PropertySchema = {
  title: {
    kind: "text",
    label: "Heading",
    help: "Shown at the top of the widget. Leave it empty to hide the header entirely.",
    defaultValue: "",
    group: "Content",
    placeholder: "Optional heading",
    maxLength: 80,
  },
};

function withHeading(schema: PropertySchema): PropertySchema {
  return { ...headingProperty, ...schema };
}

export const coreWidgetDefinitions: WidgetDefinition[] = [
  {
    type: "essentials.clock",
    name: "Clock",
    summary: "The time and date, in the format you prefer.",
    category: "Essentials",
    icon: "clock",
    defaultSpan: { columns: 3, rows: 2 },
    minimumSpan: { columns: 2, rows: 1 },
    defaultRefreshSeconds: 1,
    helpTopicId: "onboarding",
    previewHint: "Shows the current time.",
    schema: withHeading({
      format: {
        kind: "select",
        label: "Time format",
        help: "Twelve-hour shows am and pm. Twenty-four-hour does not.",
        defaultValue: "24h",
        group: "Appearance",
        options: [
          { value: "24h", label: "24-hour" },
          { value: "12h", label: "12-hour" },
        ],
      },
      showSeconds: {
        kind: "toggle",
        label: "Show seconds",
        help: "Seconds update every second, which uses slightly more power on a laptop.",
        defaultValue: false,
        group: "Appearance",
      },
      showDate: {
        kind: "toggle",
        label: "Show the date",
        help: "Adds the weekday and date beneath the time.",
        defaultValue: true,
        group: "Appearance",
      },
      timeZone: {
        kind: "text",
        label: "Time zone",
        help: "Leave empty to follow your Mac. Otherwise use a name such as Europe/London.",
        defaultValue: "",
        group: "Advanced",
        advanced: true,
      },
    }),
  },

  {
    type: "essentials.note",
    name: "Note",
    summary: "A pinned piece of text that stays exactly where you put it.",
    category: "Essentials",
    icon: "note.text",
    defaultSpan: { columns: 4, rows: 3 },
    minimumSpan: { columns: 2, rows: 2 },
    helpTopicId: "visual-editor",
    previewHint: "A place for something you keep forgetting.",
    schema: withHeading({
      body: {
        kind: "longText",
        label: "Text",
        help: "Plain text. Line breaks are kept exactly as you type them.",
        defaultValue: "",
        group: "Content",
        placeholder: "Write anything you want to keep in front of you.",
        maxLength: 4000,
      },
      emphasis: {
        kind: "select",
        label: "Emphasis",
        help: "Changes how strongly the note stands out from the page.",
        defaultValue: "normal",
        group: "Appearance",
        options: [
          { value: "quiet", label: "Quiet" },
          { value: "normal", label: "Normal" },
          { value: "strong", label: "Strong" },
        ],
      },
    }),
  },

  {
    type: "essentials.links",
    name: "Quick links",
    summary: "The handful of places you actually open every day.",
    category: "Essentials",
    icon: "link",
    defaultSpan: { columns: 4, rows: 3 },
    minimumSpan: { columns: 2, rows: 2 },
    helpTopicId: "visual-editor",
    previewHint: "Add the links you open most.",
    schema: withHeading({
      links: {
        kind: "list",
        label: "Links",
        help: "Each address is checked before it is opened. Only standard web links are allowed.",
        defaultValue: [],
        group: "Content",
        itemLabel: "Link",
        itemSchema: {
          label: {
            kind: "text",
            label: "Label",
            help: "What this link is called in the list.",
            defaultValue: "",
          },
          target: {
            kind: "link",
            label: "Address",
            help: "A full https:// address.",
            defaultValue: { url: "", label: "", openIn: "browser" },
          },
        },
      },
      columns: {
        kind: "slider",
        label: "Columns",
        help: "How many links sit side by side.",
        defaultValue: 2,
        group: "Appearance",
        min: 1,
        max: 4,
        step: 1,
      },
    }),
  },

  {
    type: "knowledge.search",
    name: "Brain search",
    summary: "Search everything you have filed, without leaving the page.",
    category: "Knowledge",
    icon: "magnifyingglass",
    defaultSpan: { columns: 6, rows: 4 },
    minimumSpan: { columns: 3, rows: 2 },
    dataEndpoint: "/api/knowledge/search",
    helpTopicId: "onboarding",
    previewHint: "Type to search your notes, with the source of every result.",
    schema: withHeading({
      project: {
        kind: "text",
        label: "Limit to project",
        help: "Leave empty to search everything. Otherwise only this project is searched.",
        defaultValue: "",
        group: "Data",
      },
      resultCount: {
        kind: "slider",
        label: "Results shown",
        help: "How many results fit before the list scrolls.",
        defaultValue: 5,
        group: "Appearance",
        min: 3,
        max: 20,
        step: 1,
      },
      includeArchived: {
        kind: "toggle",
        label: "Include archived items",
        help: "Archived items are hidden from search by default.",
        defaultValue: false,
        group: "Data",
        advanced: true,
      },
    }),
  },

  {
    type: "knowledge.recent",
    name: "Recently touched",
    summary: "What you were last working on, so you can pick it straight back up.",
    category: "Knowledge",
    icon: "clock.arrow.circlepath",
    defaultSpan: { columns: 4, rows: 4 },
    minimumSpan: { columns: 3, rows: 2 },
    dataEndpoint: "/api/knowledge",
    defaultRefreshSeconds: 120,
    helpTopicId: "onboarding",
    previewHint: "The last things you edited, newest first.",
    schema: withHeading({
      count: {
        kind: "slider",
        label: "Items",
        help: "How many recent items to list.",
        defaultValue: 6,
        group: "Appearance",
        min: 3,
        max: 20,
        step: 1,
      },
      favouritesOnly: {
        kind: "toggle",
        label: "Favourites only",
        help: "Show only items you have starred.",
        defaultValue: false,
        group: "Data",
      },
    }),
  },

  {
    type: "runescape.skills",
    name: "RuneScape skills",
    summary: "Levels and experience, read from the public hiscores.",
    category: "Games",
    icon: "chart.bar",
    defaultSpan: { columns: 5, rows: 4 },
    minimumSpan: { columns: 3, rows: 2 },
    requiresConnection: "runescape",
    dataEndpoint: "/api/widget-data",
    defaultRefreshSeconds: 900,
    helpTopicId: "runescape-setup",
    previewHint: "Connect RuneScape to see your levels.",
    schema: withHeading({
      skills: {
        kind: "multiSelect",
        label: "Skills shown",
        help: "Pick the skills you care about. Leave empty to show your overall total only.",
        defaultValue: [],
        group: "Content",
        options: [
          { value: "overall", label: "Overall" },
          { value: "attack", label: "Attack" },
          { value: "defence", label: "Defence" },
          { value: "strength", label: "Strength" },
          { value: "hitpoints", label: "Hitpoints" },
          { value: "ranged", label: "Ranged" },
          { value: "prayer", label: "Prayer" },
          { value: "magic", label: "Magic" },
          { value: "cooking", label: "Cooking" },
          { value: "woodcutting", label: "Woodcutting" },
          { value: "fletching", label: "Fletching" },
          { value: "fishing", label: "Fishing" },
          { value: "firemaking", label: "Firemaking" },
          { value: "crafting", label: "Crafting" },
          { value: "smithing", label: "Smithing" },
          { value: "mining", label: "Mining" },
          { value: "herblore", label: "Herblore" },
          { value: "agility", label: "Agility" },
          { value: "thieving", label: "Thieving" },
          { value: "slayer", label: "Slayer" },
          { value: "farming", label: "Farming" },
          { value: "runecraft", label: "Runecraft" },
          { value: "hunter", label: "Hunter" },
          { value: "construction", label: "Construction" },
        ],
      },
      showRemainingXp: {
        kind: "toggle",
        label: "Show experience to next level",
        help: "Adds how much experience remains until the next level.",
        defaultValue: true,
        group: "Content",
      },
    }),
  },

  {
    type: "runescape.grandExchange",
    name: "Grand Exchange watch",
    summary: "Prices for the items you are watching, always labelled with how fresh they are.",
    category: "Games",
    icon: "cart",
    defaultSpan: { columns: 4, rows: 4 },
    minimumSpan: { columns: 3, rows: 2 },
    requiresConnection: "runescape",
    dataEndpoint: "/api/widget-data",
    defaultRefreshSeconds: 1800,
    helpTopicId: "runescape-setup",
    previewHint: "Connect RuneScape and add the items you watch.",
    schema: withHeading({
      items: {
        kind: "list",
        label: "Items",
        help: "The items to watch. Prices come from the public Grand Exchange data.",
        defaultValue: [],
        group: "Content",
        itemLabel: "Item",
        itemSchema: {
          name: {
            kind: "text",
            label: "Item name",
            help: "The item's name exactly as it appears in game.",
            defaultValue: "",
          },
        },
      },
      showTrend: {
        kind: "toggle",
        label: "Show the recent trend",
        help: "Adds the direction the price has moved, based on the same public data.",
        defaultValue: true,
        group: "Content",
      },
    }),
  },

  {
    type: "commerce.orders",
    name: "Recent orders",
    summary: "Orders from a connected store, with the moment each figure was fetched.",
    category: "Commerce",
    icon: "bag",
    defaultSpan: { columns: 6, rows: 4 },
    minimumSpan: { columns: 3, rows: 2 },
    requiresConnection: "shopify",
    dataEndpoint: "/api/widget-data",
    defaultRefreshSeconds: 300,
    helpTopicId: "shopify-setup",
    previewHint: "Connect a store to see real orders. Nothing is shown until you do.",
    schema: withHeading({
      count: {
        kind: "slider",
        label: "Orders shown",
        help: "How many recent orders to list.",
        defaultValue: 5,
        group: "Appearance",
        min: 1,
        max: 25,
        step: 1,
      },
      playSoundOnSale: {
        kind: "toggle",
        label: "Play a sound on a new order",
        help: "Each order plays at most once — a repeated delivery never sounds twice.",
        defaultValue: false,
        group: "Behaviour",
      },
      sound: {
        kind: "audio",
        label: "Sound",
        help: "The sound played for a new order.",
        defaultValue: { mode: "builtIn", builtInId: "nexus-chime", uploadPath: null, volume: 0.6 },
        group: "Behaviour",
        visibleWhen: { property: "playSoundOnSale", equals: true },
      },
    }),
  },

  {
    type: "developer.issues",
    name: "GitHub issues",
    summary: "Open issues from the repositories your token can see.",
    category: "Automation",
    icon: "exclamationmark.bubble",
    defaultSpan: { columns: 5, rows: 4 },
    minimumSpan: { columns: 3, rows: 2 },
    requiresConnection: "github",
    dataEndpoint: "/api/widget-data",
    defaultRefreshSeconds: 600,
    helpTopicId: "github-setup",
    previewHint: "Connect GitHub to see issues.",
    schema: withHeading({
      repository: {
        kind: "text",
        label: "Repository",
        help: "In owner/name form. Leave empty to show issues assigned to you across everything the token can reach.",
        defaultValue: "",
        group: "Data",
        placeholder: "owner/repository",
      },
      state: {
        kind: "select",
        label: "Which issues",
        help: "Open issues only, closed only, or both.",
        defaultValue: "open",
        group: "Data",
        options: [
          { value: "open", label: "Open" },
          { value: "closed", label: "Closed" },
          { value: "all", label: "All" },
        ],
      },
      count: {
        kind: "slider",
        label: "Issues shown",
        help: "How many issues to list.",
        defaultValue: 6,
        group: "Appearance",
        min: 1,
        max: 25,
        step: 1,
      },
    }),
  },

  {
    type: "automation.workflowRuns",
    name: "Workflow runs",
    summary: "What your workflows did recently, including anything waiting for your approval.",
    category: "Automation",
    icon: "arrow.triangle.branch",
    defaultSpan: { columns: 5, rows: 3 },
    minimumSpan: { columns: 3, rows: 2 },
    dataEndpoint: "/api/widget-data",
    defaultRefreshSeconds: 60,
    helpTopicId: "workflows",
    previewHint: "Runs appear here once you enable a workflow.",
    schema: withHeading({
      count: {
        kind: "slider",
        label: "Runs shown",
        help: "How many recent runs to list.",
        defaultValue: 5,
        group: "Appearance",
        min: 1,
        max: 20,
        step: 1,
      },
      onlyNeedingAttention: {
        kind: "toggle",
        label: "Only runs needing attention",
        help: "Show only runs that failed or are waiting for your approval.",
        defaultValue: false,
        group: "Data",
      },
    }),
  },

  {
    type: "system.bridgeStatus",
    name: "Bridge status",
    summary: "Whether Nexus Desktop is running, and what to do when it is not.",
    category: "System",
    icon: "bolt.horizontal",
    defaultSpan: { columns: 3, rows: 2 },
    minimumSpan: { columns: 2, rows: 1 },
    requiresBridge: true,
    dataEndpoint: "/api/bridge/status",
    defaultRefreshSeconds: 30,
    helpTopicId: "troubleshooting",
    previewHint: "Shows whether the local Bridge is reachable.",
    schema: withHeading({
      showVersion: {
        kind: "toggle",
        label: "Show the Bridge version",
        help: "Useful when reporting a problem.",
        defaultValue: false,
        group: "Content",
        advanced: true,
      },
    }),
  },

  {
    type: "system.launcher",
    name: "App launcher",
    summary: "Open an application on your Mac. Requires Nexus Desktop to be running.",
    category: "System",
    icon: "square.grid.2x2",
    defaultSpan: { columns: 4, rows: 2 },
    minimumSpan: { columns: 2, rows: 1 },
    requiresBridge: true,
    helpTopicId: "permissions",
    previewHint: "Add the apps you open most. Each launch is recorded in the audit trail.",
    schema: withHeading({
      applications: {
        kind: "list",
        label: "Applications",
        help: "Applications that are not installed are shown with a way to install them, never hidden.",
        defaultValue: [],
        group: "Content",
        itemLabel: "Application",
        itemSchema: {
          label: {
            kind: "text",
            label: "Name",
            help: "What this application is called in the list.",
            defaultValue: "",
          },
          bundleId: {
            kind: "text",
            label: "Bundle identifier",
            help: "For example com.apple.Safari. Nexus only launches applications you list here.",
            defaultValue: "",
          },
        },
      },
    }),
  },

  {
    type: "web.image",
    name: "Image",
    summary: "A picture from your library, an upload, or a validated web address.",
    category: "Web",
    icon: "photo",
    defaultSpan: { columns: 4, rows: 3 },
    minimumSpan: { columns: 2, rows: 2 },
    helpTopicId: "visual-editor",
    previewHint: "Every image is checked byte by byte before it is displayed.",
    schema: withHeading({
      image: {
        kind: "image",
        label: "Image",
        help: "Uploads are validated by their actual bytes, not their file name.",
        defaultValue: {
          mode: "builtIn",
          builtInId: "nexus-abstract-01",
          uploadPath: null,
          remoteURL: null,
          feedId: null,
          altText: "",
          attribution: null,
        },
        group: "Content",
        aspectHint: "Any aspect ratio works; the widget crops to fit its zone.",
      },
      fit: {
        kind: "select",
        label: "Fit",
        help: "Cover fills the space and may crop. Contain shows the whole image.",
        defaultValue: "cover",
        group: "Appearance",
        options: [
          { value: "cover", label: "Cover" },
          { value: "contain", label: "Contain" },
        ],
      },
    }),
  },

  {
    type: "system.onboarding",
    name: "Getting started",
    summary: "The first-run checklist, with a link that actually completes each step.",
    category: "Essentials",
    icon: "checklist",
    defaultSpan: { columns: 5, rows: 4 },
    minimumSpan: { columns: 3, rows: 3 },
    helpTopicId: "onboarding",
    previewHint: "Six short steps to a workspace that is yours.",
    schema: withHeading({
      hideWhenComplete: {
        kind: "toggle",
        label: "Hide when everything is done",
        help: "Removes the widget from the page once every step is complete. You can always add it back.",
        defaultValue: true,
        group: "Behaviour",
      },
    }),
  },
];

/** Builds a registry containing the core catalogue. Cheap; call it per request. */
export function buildWidgetRegistry(): WidgetRegistry {
  return new WidgetRegistry().registerAll(coreWidgetDefinitions);
}

/** Flattens a definition into the text used by `GET /api/search`. */
export function widgetSearchText(definition: WidgetDefinition): string {
  const parts = [definition.name, definition.summary, definition.type, definition.category];
  for (const [key, property] of Object.entries(definition.schema)) {
    parts.push(key, property.label, property.help);
  }
  return parts.join("\n");
}
