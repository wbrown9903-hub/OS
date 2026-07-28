/**
 * The shell's own screens.
 *
 * These are routes this app implements, as opposed to widgets or connections,
 * which come from the configuration document and the API. The launcher, the dock
 * fallback, the command palette and the workspace switcher all read this one
 * list so a new screen never has to be registered in four places.
 */

export interface ShellDestination {
  id: string;
  title: string;
  /** One line describing what the screen is for. Shown in the launcher and palette. */
  summary: string;
  href: string;
  icon: string;
  group: "Workspace" | "Services" | "System";
  /** Words a person might type when they mean this screen. Feeds fuzzy search. */
  keywords: string[];
  /** Connection this screen is about, when it has one. Drives its status chip. */
  service?: string;
}

export const shellDestinations: ShellDestination[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    summary: "Your arranged widgets for the current workspace.",
    href: "/dashboard",
    icon: "square.grid.2x2",
    group: "Workspace",
    keywords: ["home", "overview", "widgets", "start", "desktop"],
  },
  {
    id: "launcher",
    title: "Launcher",
    summary: "Every app, screen and service in one grid.",
    href: "/launcher",
    icon: "square.grid.3x3",
    group: "Workspace",
    keywords: ["apps", "all apps", "open", "grid", "spotlight"],
  },
  {
    id: "workspaces",
    title: "Workspaces",
    summary: "Switch between arrangements and see what each one opens.",
    href: "/workspaces",
    icon: "rectangle.3.group",
    group: "Workspace",
    keywords: ["spaces", "modes", "switch", "focus", "layout"],
  },
  {
    id: "ai",
    title: "AI Workspace",
    summary: "Conversations, models and prompts, with the provider you have connected.",
    href: "/ai",
    icon: "sparkles",
    group: "Services",
    keywords: ["assistant", "chat", "model", "prompt", "llm", "claude", "gpt"],
    service: "ai",
  },
  {
    id: "brain",
    title: "Cloud Brain",
    summary: "Everything Nexus OS remembers, searchable, with where each fact came from.",
    href: "/brain",
    icon: "brain",
    group: "Services",
    keywords: ["knowledge", "memory", "notes", "search", "documents"],
    service: "cloud-brain",
  },
  {
    id: "commerce",
    title: "Commerce",
    summary: "Orders, revenue and stock from your connected store.",
    href: "/commerce",
    icon: "cart",
    group: "Services",
    keywords: ["shop", "shopify", "orders", "sales", "revenue", "store", "products"],
    service: "shopify",
  },
  {
    id: "runescape",
    title: "RuneScape",
    summary: "Skills, experience and goals for the account you track.",
    href: "/runescape",
    icon: "gamecontroller",
    group: "Services",
    keywords: ["osrs", "rs3", "game", "skills", "xp", "hiscores"],
    service: "runescape",
  },
  {
    id: "workflows",
    title: "Workflows",
    summary: "Automations you have built, their runs and their failures.",
    href: "/workflows",
    icon: "flowchart",
    group: "Services",
    keywords: ["automation", "flows", "triggers", "runs", "jobs"],
    service: "workflows",
  },
  {
    id: "mcp",
    title: "MCP Centre",
    summary: "Model Context Protocol servers, their tools and what each tool may do.",
    href: "/mcp",
    icon: "puzzlepiece.extension",
    group: "Services",
    keywords: ["tools", "servers", "model context protocol", "integrations", "plugins"],
    service: "mcp",
  },
  {
    id: "crypto",
    title: "Crypto",
    summary: "Watch-only wallet balances and market prices.",
    href: "/crypto",
    icon: "bitcoinsign.circle",
    group: "Services",
    keywords: ["wallet", "bitcoin", "ethereum", "portfolio", "prices", "market"],
    service: "crypto",
  },
  {
    id: "settings",
    title: "Settings",
    summary: "Appearance, connections, permissions, privacy, backup and recovery.",
    href: "/settings",
    icon: "gearshape",
    group: "System",
    keywords: ["preferences", "options", "configure", "system"],
  },
  {
    id: "help",
    title: "Help Centre",
    summary: "Step-by-step walkthroughs for everything in Nexus OS.",
    href: "/help",
    icon: "questionmark.circle",
    group: "System",
    keywords: ["support", "guide", "how to", "docs", "tutorial", "manual"],
  },
];

export const settingsSections: ShellDestination[] = [
  {
    id: "settings.appearance",
    title: "Appearance",
    summary: "Theme, density, corner radius, transparency and motion.",
    href: "/settings/appearance",
    icon: "paintpalette",
    group: "System",
    keywords: ["theme", "dark", "light", "colour", "color", "font", "motion", "animation"],
  },
  {
    id: "settings.connections",
    title: "Connections",
    summary: "Every service Nexus OS talks to and the state each one is in.",
    href: "/settings/connections",
    icon: "link",
    group: "System",
    keywords: ["services", "accounts", "integrations", "sign in", "connect"],
  },
  {
    id: "settings.permissions",
    title: "Permissions",
    summary: "What Nexus OS may do on your Mac, and what each permission is for.",
    href: "/settings/permissions",
    icon: "lock.shield",
    group: "System",
    keywords: ["access", "accessibility", "automation", "screen", "microphone", "grant"],
  },
  {
    id: "settings.desktop",
    title: "Nexus Desktop",
    summary: "The native macOS app and the Mac Bridge that runs alongside it.",
    href: "/settings/desktop",
    icon: "desktopcomputer",
    group: "System",
    keywords: ["bridge", "native", "mac", "app", "launch"],
  },
  {
    id: "settings.privacy",
    title: "Privacy",
    summary: "What is stored, where it goes and what leaves your machine.",
    href: "/settings/privacy",
    icon: "hand.raised",
    group: "System",
    keywords: ["data", "tracking", "telemetry", "audit", "log"],
  },
  {
    id: "settings.backup",
    title: "Backup & Restore",
    summary: "Export your whole setup, or restore it from a file or an earlier version.",
    href: "/settings/backup",
    icon: "arrow.clockwise.circle",
    group: "System",
    keywords: ["export", "import", "restore", "history", "undo", "version"],
  },
  {
    id: "settings.recovery",
    title: "Recovery & Safe Mode",
    summary: "Start with extensions disabled when something has gone wrong.",
    href: "/settings/recovery",
    icon: "lifepreserver",
    group: "System",
    keywords: ["safe mode", "repair", "broken", "reset", "recover", "troubleshoot"],
  },
  {
    id: "settings.about",
    title: "About",
    summary: "Versions, build details and what has been verified on this machine.",
    href: "/settings/about",
    icon: "info.circle",
    group: "System",
    keywords: ["version", "build", "licence", "license", "credits", "diagnostics"],
  },
];

export function destinationForHref(href: string): ShellDestination | undefined {
  const all = [...shellDestinations, ...settingsSections];
  return (
    all.find((destination) => destination.href === href) ??
    all.find((destination) => href.startsWith(`${destination.href}/`))
  );
}
