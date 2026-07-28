import type { ConfigDocument, WidgetDefinition, WidgetNode } from "@nexus/schemas";
import type { HelpTopic } from "./types";

/**
 * First-run and offline fallbacks.
 *
 * `GET /api/config` is the source of truth for the interface. This module only
 * supplies what the shell draws *before* that call returns, and what it draws if
 * that call fails — which, during development and on a machine that has never
 * been signed in to anything, is the ordinary case rather than an error.
 *
 * Nothing here is written back to the server. The moment the real document
 * arrives it replaces this one wholesale.
 */

function widget(node: Partial<WidgetNode> & Pick<WidgetNode, "id" | "type" | "zone">): WidgetNode {
  return {
    order: 0,
    span: { columns: 4, rows: 2 },
    priority: 50,
    pinned: false,
    settings: {},
    refreshSeconds: 0,
    shortcut: null,
    ...node,
    visibility: {
      requiresConnection: null,
      requiresBridge: false,
      requiresPermission: null,
      hours: null,
      minimumWidth: null,
      hidden: false,
      ...(node.visibility ?? {}),
    },
  };
}

export const fallbackDocument: ConfigDocument = {
  schemaVersion: 1,
  revision: 0,
  productName: "Nexus OS",
  themeId: "nexus-obsidian",
  pages: [
    {
      id: "home",
      title: "Overview",
      icon: "square.grid.2x2",
      showInNavigation: true,
      zones: [
        { id: "hero", label: "At a glance", layout: "grid", collapsed: false },
        { id: "main", label: "Your services", layout: "grid", collapsed: false },
        { id: "rail", label: "Nearby", layout: "rail", collapsed: false },
      ],
      widgets: [
        widget({
          id: "welcome",
          type: "system.welcome",
          zone: "hero",
          order: 0,
          span: { columns: 8, rows: 2 },
          pinned: true,
        }),
        widget({
          id: "system-status",
          type: "system.status",
          zone: "hero",
          order: 1,
          span: { columns: 4, rows: 2 },
          refreshSeconds: 60,
        }),
        widget({
          id: "commerce-today",
          type: "commerce.today",
          zone: "main",
          order: 0,
          span: { columns: 4, rows: 2 },
          refreshSeconds: 300,
          visibility: { requiresConnection: "shopify" } as WidgetNode["visibility"],
        }),
        widget({
          id: "runescape-hero",
          type: "runescape.hero",
          zone: "main",
          order: 1,
          span: { columns: 4, rows: 2 },
          refreshSeconds: 900,
          visibility: { requiresConnection: "runescape" } as WidgetNode["visibility"],
        }),
        widget({
          id: "brain-recent",
          type: "brain.recent",
          zone: "main",
          order: 2,
          span: { columns: 4, rows: 2 },
        }),
        widget({
          id: "quick-launch",
          type: "system.quickLaunch",
          zone: "rail",
          order: 0,
          span: { columns: 3, rows: 2 },
          visibility: { requiresBridge: true } as WidgetNode["visibility"],
        }),
        widget({
          id: "workflow-runs",
          type: "workflows.recentRuns",
          zone: "rail",
          order: 1,
          span: { columns: 3, rows: 2 },
        }),
        widget({
          id: "help-next",
          type: "system.nextSteps",
          zone: "rail",
          order: 2,
          span: { columns: 3, rows: 2 },
        }),
      ],
    },
  ],
  workspaces: [
    {
      id: "everyday",
      title: "Everyday",
      icon: "rectangle.3.group",
      onEnter: [],
      pageIds: ["home"],
      silencedCategories: [],
    },
  ],
  dock: [
    {
      id: "dock.dashboard",
      label: "Dashboard",
      icon: "square.grid.2x2",
      action: { type: "openPage", target: "/dashboard" },
      requiresApplication: null,
    },
    {
      id: "dock.launcher",
      label: "Launcher",
      icon: "square.grid.3x3",
      action: { type: "openPage", target: "/launcher" },
      requiresApplication: null,
    },
    {
      id: "dock.ai",
      label: "AI Workspace",
      icon: "sparkles",
      action: { type: "openPage", target: "/ai" },
      requiresApplication: null,
    },
    {
      id: "dock.brain",
      label: "Cloud Brain",
      icon: "brain",
      action: { type: "openPage", target: "/brain" },
      requiresApplication: null,
    },
    {
      id: "dock.commerce",
      label: "Commerce",
      icon: "cart",
      action: { type: "openPage", target: "/commerce" },
      requiresApplication: null,
    },
    {
      id: "dock.runescape",
      label: "RuneScape",
      icon: "gamecontroller",
      action: { type: "openPage", target: "/runescape" },
      requiresApplication: null,
    },
    {
      id: "dock.workflows",
      label: "Workflows",
      icon: "flowchart",
      action: { type: "openPage", target: "/workflows" },
      requiresApplication: null,
    },
    {
      id: "dock.mcp",
      label: "MCP Centre",
      icon: "puzzlepiece.extension",
      action: { type: "openPage", target: "/mcp" },
      requiresApplication: null,
    },
    {
      id: "dock.crypto",
      label: "Crypto",
      icon: "bitcoinsign.circle",
      action: { type: "openPage", target: "/crypto" },
      requiresApplication: null,
    },
    {
      id: "dock.settings",
      label: "Settings",
      icon: "gearshape",
      action: { type: "openPage", target: "/settings" },
      requiresApplication: null,
    },
  ],
  topBar: {
    enabled: true,
    showClock: true,
    showSearch: true,
    showSystemStatus: true,
    items: [],
  },
  preferences: {
    experienceLevel: "standard",
    animationIntensity: 0.8,
    soundVolume: 0.5,
    soundsEnabled: true,
    cornerRadius: 14,
    panelTransparency: 0.72,
    density: "comfortable",
    fontId: "system",
    gamificationEnabled: true,
    quietHours: { enabled: false, from: 22, to: 7 },
  },
};

/**
 * A minimal catalogue used only while `GET /api/widgets` is unavailable, so the
 * dashboard can still say what each card *is* instead of showing a blank frame.
 * The authoritative definitions live with the widgets themselves.
 */
export const fallbackDefinitions: WidgetDefinition[] = [
  {
    type: "system.welcome",
    name: "Welcome",
    summary: "What Nexus OS can do for you, and the fastest way in.",
    category: "Essentials",
    icon: "hand.wave",
    schema: {},
    defaultSpan: { columns: 8, rows: 2 },
    minimumSpan: { columns: 4, rows: 2 },
    helpTopicId: "getting-started",
  },
  {
    type: "system.status",
    name: "System status",
    summary: "Connections, the Mac Bridge and anything that needs attention.",
    category: "System",
    icon: "waveform.path.ecg",
    schema: {},
    defaultSpan: { columns: 4, rows: 2 },
    minimumSpan: { columns: 3, rows: 2 },
    defaultRefreshSeconds: 60,
    helpTopicId: "system-status",
  },
  {
    type: "system.quickLaunch",
    name: "Quick launch",
    summary: "Open a Mac application from the dashboard.",
    category: "System",
    icon: "bolt",
    schema: {},
    defaultSpan: { columns: 3, rows: 2 },
    minimumSpan: { columns: 2, rows: 1 },
    requiresBridge: true,
    helpTopicId: "mac-bridge",
  },
  {
    type: "system.nextSteps",
    name: "Next steps",
    summary: "The setup work still worth doing, in order.",
    category: "Essentials",
    icon: "checklist",
    schema: {},
    defaultSpan: { columns: 3, rows: 2 },
    minimumSpan: { columns: 2, rows: 2 },
    helpTopicId: "getting-started",
  },
  {
    type: "commerce.today",
    name: "Today's orders",
    summary: "Orders and revenue so far today from your connected store.",
    category: "Commerce",
    icon: "cart",
    schema: {},
    defaultSpan: { columns: 4, rows: 2 },
    minimumSpan: { columns: 3, rows: 2 },
    requiresConnection: "shopify",
    defaultRefreshSeconds: 300,
    helpTopicId: "connect-shopify",
  },
  {
    type: "runescape.hero",
    name: "RuneScape overview",
    summary: "Total level, experience and progress towards your next goal.",
    category: "Games",
    icon: "gamecontroller",
    schema: {},
    defaultSpan: { columns: 4, rows: 2 },
    minimumSpan: { columns: 3, rows: 2 },
    requiresConnection: "runescape",
    defaultRefreshSeconds: 900,
    helpTopicId: "connect-runescape",
  },
  {
    type: "brain.recent",
    name: "Recent knowledge",
    summary: "The most recent things Nexus OS has remembered for you.",
    category: "Knowledge",
    icon: "brain",
    schema: {},
    defaultSpan: { columns: 4, rows: 2 },
    minimumSpan: { columns: 3, rows: 2 },
    helpTopicId: "cloud-brain",
  },
  {
    type: "workflows.recentRuns",
    name: "Recent workflow runs",
    summary: "What your automations did most recently, and anything that failed.",
    category: "Automation",
    icon: "flowchart",
    schema: {},
    defaultSpan: { columns: 3, rows: 2 },
    minimumSpan: { columns: 2, rows: 2 },
    helpTopicId: "workflows",
  },
];

/**
 * Shown when `GET /api/help/topics` is unavailable. Keeping a handful of topics
 * on the client means the "?" buttons and the walkthroughs never dead-end during
 * development.
 */
export const fallbackHelpTopics: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting started with Nexus OS",
    summary: "What the parts of the screen are, and the three things worth doing first.",
    steps: [
      {
        title: "Learn the frame",
        body: "The bar along the top holds your workspace, search, the clock, system status and notifications. The dock along the bottom opens screens and applications. Everything between them is your dashboard.",
      },
      {
        title: "Open the command palette",
        body: "Press Command-K (Control-K on a PC keyboard) anywhere in Nexus OS. Type what you want — an app name, a screen, or a phrase such as “open runescape” — and press Return.",
      },
      {
        title: "Connect one service",
        body: "Open Settings › Connections and connect whichever service you use most. Widgets that need it stop showing their explanation card and start showing live information.",
      },
    ],
    related: ["command-palette", "system-status"],
  },
  {
    id: "command-palette",
    title: "Using the command palette",
    summary: "One keystroke reaches every app, screen, setting and help topic.",
    steps: [
      { title: "Open it", body: "Press Command-K, or choose the search field in the top bar." },
      {
        title: "Move without the mouse",
        body: "Arrow keys move the selection, Return runs it, Escape closes. Results are grouped, and the group name is announced as you move between groups.",
      },
      {
        title: "Ask in plain language",
        body: "Phrases such as “show today's orders” or “switch to focus” are turned into a named action shown above the results. Anything that changes something asks you to confirm first.",
      },
    ],
    related: ["getting-started"],
  },
  {
    id: "system-status",
    title: "Reading system status",
    summary: "What Live, Cached, Not connected and Needs attention each mean.",
    steps: [
      {
        title: "Every number is labelled",
        body: "Nexus OS never shows a figure without saying where it came from. “Live” was fetched just now; “Cached” is recent but not current; “Last updated…” is older than it should be.",
      },
      {
        title: "Not connected is not an error",
        body: "A service you have never signed in to reads “Not connected”. The card tells you the one step that changes that.",
      },
      {
        title: "Needs attention",
        body: "A connection that failed shows what happened and what to do. Open it from Settings › Connections to see the full history.",
      },
    ],
    related: ["getting-started"],
  },
  {
    id: "mac-bridge",
    title: "Nexus Desktop and the Mac Bridge",
    summary: "How Nexus OS opens applications and arranges windows, and what it cannot do.",
    steps: [
      {
        title: "What the Bridge is",
        body: "A small native service that runs alongside the Nexus OS app on your Mac. It exposes a fixed list of checked actions — open an application, open a link, arrange windows — and nothing else. The web interface never gets shell access.",
      },
      {
        title: "When it is unavailable",
        body: "Widgets that need it explain that Nexus Desktop is not running rather than disappearing. Open the Nexus OS app on your Mac and they come back.",
      },
      {
        title: "Every action is recorded",
        body: "Each Bridge action is written to an audit log you can read in Settings › Privacy.",
      },
    ],
    related: ["system-status"],
  },
  {
    id: "themes",
    title: "Changing how Nexus OS looks",
    summary: "Themes, density, motion and transparency, and how accessibility settings override them.",
    steps: [
      {
        title: "Pick a theme",
        body: "Settings › Appearance shows every theme with a live preview. Choosing one changes colours immediately; nothing is rebuilt.",
      },
      {
        title: "Tune the details",
        body: "Corner radius, panel transparency, density and motion are sliders. Each one changes the whole interface, not one screen.",
      },
      {
        title: "Accessibility wins",
        body: "If your Mac is set to reduce motion, animation is switched off entirely and the sliders cannot turn it back on. The same is true of reduced transparency and increased contrast.",
      },
    ],
    related: ["getting-started"],
  },
];
