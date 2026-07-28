import { ok, problem } from "../../../../lib/server/store.js";

/**
 * Help content is data, not hard-coded screens, so it can be edited in Nexus
 * Studio, translated, exported and extended by tutorial packs without touching
 * a component. Every integration topic follows the same shape: what it does,
 * what is required, what it can reach, how to connect, how to test, how to
 * disconnect.
 */
export interface HelpStep {
  title: string;
  body: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  category: "Getting started" | "Connections" | "Automation" | "Safety" | "Maintenance";
  steps: HelpStep[];
  related: string[];
}

const topics: HelpTopic[] = [
  {
    id: "getting-started",
    title: "What Nexus OS is",
    summary: "A customisable layer that runs on top of macOS — it never replaces it.",
    category: "Getting started",
    steps: [
      {
        title: "It sits above macOS",
        body: "Your Dock, menu bar and windows all keep working exactly as before. Nexus adds a dashboard, a launcher and a command bar on top. Nothing about macOS is modified.",
      },
      {
        title: "You can always step back",
        body: "The top bar has an Exit to macOS control. It hides the Nexus shell immediately and leaves your Mac untouched. Nexus can also be paused entirely from the menu bar.",
      },
      {
        title: "Everything you see is editable",
        body: "Open Nexus Studio to move, resize, rename, hide or delete any panel, change wording and images, and build new pages. Nothing on screen is fixed.",
      },
      {
        title: "Your information stays on your Mac",
        body: "Notes, memory and settings are stored locally by default. Cloud sync is optional and you choose which categories are included.",
      },
    ],
    related: ["nexus-studio", "permissions", "backup"],
  },
  {
    id: "permissions",
    title: "macOS permissions",
    summary: "Why each permission is asked for, and how to change your mind later.",
    category: "Getting started",
    steps: [
      {
        title: "Nexus asks one permission at a time",
        body: "Each request explains which feature needs it. You can skip any of them — the rest of Nexus keeps working, and the affected panels explain what they need instead of failing.",
      },
      {
        title: "Accessibility",
        body: "Needed only to move, resize and tile windows for you. Without it, launching apps and opening files still work.",
      },
      {
        title: "Notifications",
        body: "Needed to tell you about finished workflows, sale events and connection problems. Without it, everything still appears in the Nexus notification centre.",
      },
      {
        title: "Files and folders",
        body: "Nexus only ever sees folders you pick yourself. It cannot reach anywhere else, and it refuses any path outside what you chose.",
      },
      {
        title: "Changing your mind",
        body: "Open Settings › Permissions. Each row shows the current status and opens the exact System Settings pane. Turning one off never removes your data.",
      },
    ],
    related: ["getting-started", "desktop-actions"],
  },
  {
    id: "runescape",
    title: "Setting up RuneScape",
    summary: "Detecting the official Jagex Launcher and using the news banner.",
    category: "Connections",
    steps: [
      {
        title: "What this does",
        body: "Adds a Play button that opens the official Jagex Launcher, plus a panel showing the latest official news for RuneScape or Old School RuneScape.",
      },
      {
        title: "What is required",
        body: "The official Jagex Launcher installed on your Mac, and the Nexus OS app running so it can open applications for you.",
      },
      {
        title: "If the launcher is not found",
        body: "Nexus shows a guided screen linking to the official download page only. It never uses unofficial mirrors, and it never asks for your RuneScape sign-in details.",
      },
      {
        title: "About the banner image",
        body: "Nexus reads the official public news feed and caches the picture locally with a link back to the article. If the feed changes or is unavailable, it falls back to a banner you chose, then to built-in Nexus artwork. It can never break your dashboard.",
      },
      {
        title: "Making it yours",
        body: "In Nexus Studio you can replace the image, change the heading and buttons, point the link elsewhere, or turn automatic updates off completely.",
      },
    ],
    related: ["nexus-studio", "desktop-actions"],
  },
  {
    id: "ai-providers",
    title: "Connecting Claude and ChatGPT",
    summary: "Opening the apps, and adding an API key for the built-in AI workspace.",
    category: "Connections",
    steps: [
      {
        title: "The simplest option needs no setup",
        body: "If the Claude or ChatGPT app is installed, Nexus opens it directly. If not, it opens the official site in your browser. Nothing to configure.",
      },
      {
        title: "Why they do not appear inside Nexus",
        body: "Those services do not permit their web interface to be embedded in another app. Nexus respects that rather than working around it, so the cards offer Open App and Open in Browser instead.",
      },
      {
        title: "Using the AI workspace",
        body: "To chat inside Nexus, add your own API key under Settings › Connections. Keys are stored in your Mac's Keychain, never in a settings file and never in an export.",
      },
      {
        title: "Testing it",
        body: "Choose Test Connection. Nexus reports exactly what happened — working, key rejected, rate limited, or unreachable — with the next step for each.",
      },
      {
        title: "Removing access",
        body: "Delete the connection in Nexus, then revoke the key in the provider's own dashboard. Nexus tells you which workflows used it before you delete.",
      },
    ],
    related: ["mcp-basics", "privacy"],
  },
  {
    id: "mcp-basics",
    title: "What MCP is, in plain terms",
    summary: "How AI models get permission to actually do things — and how you stay in control.",
    category: "Automation",
    steps: [
      {
        title: "The idea",
        body: "An MCP server is a small program that offers tools — reading a file, searching a repository, listing your orders. Connecting one lets an AI model ask to use those tools.",
      },
      {
        title: "Asking is not doing",
        body: "A model can only ever propose a tool. Nexus decides separately whether it may run, based on the permission mode you picked. Text inside a document or a web page can never grant itself permission.",
      },
      {
        title: "Choosing a permission mode",
        body: "Read Only lets tools look but never change. Ask Every Time checks with you each time. Allow Selected Actions runs only the tools you ticked. Trusted Workspace runs routine tools freely but still asks before anything permanent.",
      },
      {
        title: "Seeing what happened",
        body: "Every request, approval and refusal is written to the audit log with any secrets removed. Open Settings › Audit to review it.",
      },
      {
        title: "Turning it off",
        body: "Each server has a switch, and there is a single control that disables all automation at once if you want to stop everything immediately.",
      },
    ],
    related: ["desktop-actions", "workflows", "privacy"],
  },
  {
    id: "desktop-actions",
    title: "How Nexus controls your Mac",
    summary: "A fixed list of actions — and why there is no way to run arbitrary commands.",
    category: "Safety",
    steps: [
      {
        title: "A closed list",
        body: "Nexus can open an app, open a file or folder, open a link, focus or quit an app, move, resize or tile windows, restore a workspace, show a notification, copy approved text, run an approved Shortcut, or talk to an approved MCP server. That is the entire list.",
      },
      {
        title: "There is no command action",
        body: "The web interface deliberately cannot run shell commands. Even if an AI model suggested one, there is nothing for it to call.",
      },
      {
        title: "Preview before it runs",
        body: "Anything consequential shows exactly what will happen first, with a Cancel button. Dry-run mode lets a workflow report its plan without doing anything at all.",
      },
      {
        title: "Emergency stop",
        body: "One switch in Settings disables every desktop action immediately, including anything already scheduled.",
      },
    ],
    related: ["permissions", "mcp-basics", "workflows"],
  },
  {
    id: "nexus-studio",
    title: "Editing your dashboard",
    summary: "Changing anything you can see, without touching code.",
    category: "Getting started",
    steps: [
      {
        title: "Open Studio",
        body: "Choose the paintbrush in the dock. The dashboard becomes editable: drag panels to move them, drag an edge to resize, and click one to select it.",
      },
      {
        title: "Change wording and pictures",
        body: "With a panel selected, the inspector on the right lists everything about it — headings, text, images, links, buttons, colours, spacing and how often it refreshes.",
      },
      {
        title: "Add and remove",
        body: "Add Widget opens a gallery grouped by category. Panels can be duplicated, hidden without deleting, or removed entirely.",
      },
      {
        title: "Undo is always available",
        body: "Every change can be undone with Command-Z. Version History lists earlier versions and restores any of them. You can also reset a single panel, a page, or the whole theme.",
      },
      {
        title: "Draft and publish",
        body: "Work in a draft while your live dashboard stays as it was, then publish when you are happy.",
      },
    ],
    related: ["getting-started", "backup"],
  },
  {
    id: "workflows",
    title: "Building a workflow",
    summary: "Making Nexus do a sequence of things automatically.",
    category: "Automation",
    steps: [
      {
        title: "Start with a trigger",
        body: "A button you press, a time of day, a keyboard shortcut, an app launching, a file appearing in a folder, or an event from a connected store.",
      },
      {
        title: "Add steps",
        body: "Open an app, arrange a workspace, show a notification, play a sound, save a note, ask an AI model, call an MCP tool, or wait for your approval.",
      },
      {
        title: "Test before enabling",
        body: "Dry Run reports exactly what would happen without doing any of it. Step-through runs one step at a time. An incomplete or invalid workflow cannot be enabled at all.",
      },
      {
        title: "Watching it work",
        body: "Every run is recorded with its steps, timings and any error, and secrets are removed from the log.",
      },
    ],
    related: ["mcp-basics", "desktop-actions"],
  },
  {
    id: "privacy",
    title: "What Nexus remembers",
    summary: "Seeing, editing and deleting everything Nexus knows about you.",
    category: "Safety",
    steps: [
      {
        title: "Nothing is remembered silently",
        body: "Memory records state their category, where they came from and how long they are kept. Nexus does not quietly turn everything you do into permanent memory.",
      },
      {
        title: "Reviewing it",
        body: "Settings › Privacy lists everything stored, what is synced, which services are connected and which AI providers have received which context.",
      },
      {
        title: "Changing it",
        body: "Any record can be edited or deleted. Memory can be paused entirely, given a retention period, or switched off for particular projects.",
      },
      {
        title: "Taking it with you",
        body: "Export everything at any time in a readable format, or erase it completely. Deletion is real, not a hidden flag.",
      },
    ],
    related: ["backup", "ai-providers"],
  },
  {
    id: "backup",
    title: "Backups and getting out of trouble",
    summary: "Protecting your setup, and Safe Mode when something goes wrong.",
    category: "Maintenance",
    steps: [
      {
        title: "Automatic protection",
        body: "Every time a setting is saved, the previous version is kept. Before any upgrade changes the format of your data, a backup is taken first.",
      },
      {
        title: "Making your own backup",
        body: "Settings › Backup creates one on demand, optionally encrypted, and tells you exactly what it contains. Backups are checksummed and verified.",
      },
      {
        title: "Restoring",
        body: "Restore everything, or just one part — your layout, your themes, your workflows or your knowledge — without touching the rest.",
      },
      {
        title: "Safe Mode",
        body: "If something misbehaves, Safe Mode starts Nexus with extensions, workflows and MCP switched off and the default theme, so you can put things right.",
      },
      {
        title: "Removing Nexus",
        body: "The uninstaller offers four choices, from removing just the app to removing everything including local data, and always offers to export a backup first. It tells you precisely what will remain.",
      },
    ],
    related: ["nexus-studio", "privacy"],
  },
];

export async function GET() {
  try {
    return ok({ topics });
  } catch (error) {
    return problem(error);
  }
}
