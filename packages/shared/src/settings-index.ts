/**
 * A searchable index of every setting in Nexus OS.
 *
 * `GET /api/search` uses this so "where do I turn off sounds" finds the sound
 * control rather than a help article about sound. Each entry names a real
 * destination — an entry with no working `href` is a bug, not a placeholder.
 */

export interface SettingEntry {
  id: string;
  label: string;
  /** One sentence a person can understand without knowing the codebase. */
  description: string;
  section: string;
  href: string;
  keywords: string[];
  /** Hidden in beginner mode. Security settings are never marked advanced. */
  advanced?: boolean;
  /** Help topic opened by the "What is this?" control next to the setting. */
  helpTopicId?: string;
}

export const settingsIndex: SettingEntry[] = [
  {
    id: "general.workspaceName",
    label: "Workspace name",
    description: "The name shown in the top bar and in the workspace switcher.",
    section: "General",
    href: "/settings/general",
    keywords: ["name", "title", "workspace", "rename"],
    helpTopicId: "onboarding",
  },
  {
    id: "general.experienceLevel",
    label: "Experience level",
    description:
      "Beginner hides advanced fields. It never changes what Nexus is allowed to do.",
    section: "General",
    href: "/settings/general",
    keywords: ["beginner", "advanced", "developer", "simple", "expert", "mode"],
    helpTopicId: "onboarding",
  },
  {
    id: "appearance.theme",
    label: "Theme",
    description: "Switch the whole interface's colours. Layouts are never affected.",
    section: "Appearance",
    href: "/settings/appearance",
    keywords: ["theme", "colour", "color", "dark", "light", "skin"],
    helpTopicId: "visual-editor",
  },
  {
    id: "appearance.density",
    label: "Density",
    description: "Comfortable or compact spacing throughout the interface.",
    section: "Appearance",
    href: "/settings/appearance",
    keywords: ["density", "spacing", "compact", "comfortable", "size"],
  },
  {
    id: "appearance.cornerRadius",
    label: "Corner radius",
    description: "How rounded panels and cards are, from square to very round.",
    section: "Appearance",
    href: "/settings/appearance",
    keywords: ["corner", "radius", "rounded", "square", "shape"],
  },
  {
    id: "appearance.panelTransparency",
    label: "Panel transparency",
    description:
      "How much shows through panels. Forced fully opaque when macOS asks for reduced transparency.",
    section: "Appearance",
    href: "/settings/appearance",
    keywords: ["transparency", "opacity", "blur", "frosted", "glass"],
  },
  {
    id: "appearance.animationIntensity",
    label: "Animation",
    description: "How much movement the interface uses. Clamped to none under Reduce Motion.",
    section: "Appearance",
    href: "/settings/appearance",
    keywords: ["animation", "motion", "movement", "speed", "reduce motion"],
  },
  {
    id: "appearance.font",
    label: "Interface font",
    description: "The typeface used everywhere. The system font is the default.",
    section: "Appearance",
    href: "/settings/appearance",
    keywords: ["font", "typeface", "text", "type"],
  },
  {
    id: "sound.enabled",
    label: "Sounds",
    description: "Turn interface and notification sounds on or off.",
    section: "Sound",
    href: "/settings/sound",
    keywords: ["sound", "audio", "mute", "silent", "chime", "sale sound"],
  },
  {
    id: "sound.volume",
    label: "Volume",
    description: "How loud Nexus sounds are, independent of your system volume.",
    section: "Sound",
    href: "/settings/sound",
    keywords: ["volume", "loud", "quiet", "sound level"],
  },
  {
    id: "notifications.quietHours",
    label: "Quiet hours",
    description: "Hold non-urgent notifications between the hours you choose.",
    section: "Notifications",
    href: "/settings/notifications",
    keywords: ["quiet", "do not disturb", "dnd", "night", "silence", "hours"],
  },
  {
    id: "permissions.mode",
    label: "Permission mode",
    description:
      "Disabled, Read Only, Ask Every Time, Allow Selected Actions or Trusted Workspace.",
    section: "Permissions",
    href: "/settings/permissions",
    keywords: ["permission", "mode", "trust", "ask", "approve", "allow", "deny", "security"],
    helpTopicId: "permissions",
  },
  {
    id: "permissions.confirmDestructive",
    label: "Confirm destructive actions",
    description:
      "Always ask before anything is deleted or sent, even in a Trusted Workspace.",
    section: "Permissions",
    href: "/settings/permissions",
    keywords: ["destructive", "delete", "confirm", "irreversible", "send", "safety"],
    helpTopicId: "permissions",
  },
  {
    id: "permissions.deniedTools",
    label: "Blocked actions",
    description: "Actions that can never run, in any mode. This list always wins.",
    section: "Permissions",
    href: "/settings/permissions",
    keywords: ["deny", "block", "forbidden", "never", "blacklist"],
    helpTopicId: "mcp-advanced",
  },
  {
    id: "connections.manage",
    label: "Connections",
    description: "Add, test and remove the services Nexus can reach.",
    section: "Connections",
    href: "/settings/connections",
    keywords: ["connection", "service", "integration", "api key", "connect", "link"],
    helpTopicId: "onboarding",
  },
  {
    id: "connections.localService",
    label: "Allow local network addresses",
    description:
      "Per connection. Needed for a self-hosted service on your own network, and off everywhere else.",
    section: "Connections",
    href: "/settings/connections",
    keywords: ["local", "lan", "self hosted", "private", "intranet", "localhost"],
    advanced: true,
    helpTopicId: "wordpress-setup",
  },
  {
    id: "mcp.servers",
    label: "MCP servers",
    description: "The tool servers the assistant may use, and which of their tools are enabled.",
    section: "MCP",
    href: "/settings/mcp",
    keywords: ["mcp", "tools", "server", "model context protocol", "connector"],
    helpTopicId: "mcp-beginner",
  },
  {
    id: "mcp.timeout",
    label: "Tool timeout",
    description: "How long a tool may take before Nexus gives up and tells you.",
    section: "MCP",
    href: "/settings/mcp",
    keywords: ["timeout", "slow", "hang", "wait", "seconds"],
    advanced: true,
    helpTopicId: "mcp-advanced",
  },
  {
    id: "brain.memory",
    label: "Memory",
    description:
      "What Nexus remembers, for how long, and which AI providers each memory has been shared with.",
    section: "Brain",
    href: "/settings/memory",
    keywords: ["memory", "remember", "forget", "retention", "privacy", "sharing"],
    helpTopicId: "claude-setup",
  },
  {
    id: "brain.memoryPaused",
    label: "Pause memory",
    description: "Stop recording new memories without deleting the ones you have.",
    section: "Brain",
    href: "/settings/memory",
    keywords: ["pause", "stop", "memory", "incognito", "private"],
  },
  {
    id: "brain.excludedProjects",
    label: "Projects excluded from memory",
    description: "Nothing from these projects is ever written to memory.",
    section: "Brain",
    href: "/settings/memory",
    keywords: ["exclude", "project", "private", "skip", "ignore"],
    advanced: true,
  },
  {
    id: "backup.create",
    label: "Backups",
    description: "Create, verify and restore a backup. Credentials are never included.",
    section: "Backup",
    href: "/settings/backup",
    keywords: ["backup", "restore", "export", "import", "checksum", "recovery"],
    helpTopicId: "backup-restore",
  },
  {
    id: "history.versions",
    label: "Version history",
    description: "Every committed change, with a label and a time, and a way back to any of them.",
    section: "History",
    href: "/settings/history",
    keywords: ["history", "version", "undo", "revert", "restore", "timeline"],
    helpTopicId: "visual-editor",
  },
  {
    id: "audit.log",
    label: "Audit trail",
    description:
      "Every permission decision and bridge action, with who asked and what was decided.",
    section: "Security",
    href: "/settings/audit",
    keywords: ["audit", "log", "history", "security", "decision", "record"],
    helpTopicId: "permissions",
  },
  {
    id: "bridge.status",
    label: "Nexus Bridge",
    description: "Whether the local Bridge is reachable, and the actions it exposes.",
    section: "Bridge",
    href: "/settings/bridge",
    keywords: ["bridge", "desktop", "native", "mac", "local", "connection"],
    helpTopicId: "troubleshooting",
  },
  {
    id: "account.password",
    label: "Password",
    description: "Change the password used to sign in to this Nexus server.",
    section: "Account",
    href: "/settings/account",
    keywords: ["password", "sign in", "login", "account", "credentials"],
  },
  {
    id: "account.sessions",
    label: "Active sessions",
    description: "Every browser signed in to this account, and a way to sign them out.",
    section: "Account",
    href: "/settings/account",
    keywords: ["session", "sign out", "logout", "device", "browser"],
  },
];

const settingsById = new Map(settingsIndex.map((entry) => [entry.id, entry]));

export function getSetting(id: string): SettingEntry | undefined {
  return settingsById.get(id);
}

export function settingSearchText(entry: SettingEntry): string {
  return [entry.label, entry.description, entry.section, ...entry.keywords].join("\n");
}
