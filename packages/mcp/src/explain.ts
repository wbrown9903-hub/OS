import {
  type PermissionMode,
  PERMISSION_MODES,
  permissionModeExplanation,
  permissionModeTitle,
} from "@nexus/security";

/**
 * The words the MCP centre uses.
 *
 * They live in the package rather than in a component so the wizard, the
 * confirmation sheet and the help centre cannot drift apart, and so a test can
 * assert that the explanation actually covers every stage and every mode.
 */

export interface FlowStage {
  id: string;
  title: string;
  body: string;
}

/**
 * AI Provider → MCP Server → Tools → Permissions → Workflow → Result.
 *
 * Rendered as an ordered list of real text with the arrows marked decorative, so
 * a screen reader reads the six stages rather than an unlabelled picture.
 */
export const MCP_FLOW: readonly FlowStage[] = [
  {
    id: "provider",
    title: "AI provider",
    body: "A model such as Claude or ChatGPT reads your request and suggests something to do. A suggestion is only ever a suggestion.",
  },
  {
    id: "server",
    title: "MCP server",
    body: "A small program — running on your Mac or on a service you connect to — that offers a fixed list of things it can do.",
  },
  {
    id: "tools",
    title: "Tools",
    body: "Each item on that list is a tool, like “read a file” or “create an order”. Nexus OS reads the list and labels what each one changes.",
  },
  {
    id: "permissions",
    title: "Permissions",
    body: "Your rules decide whether a tool may run, run after you approve it, or not run at all. This is the only stage that can say yes.",
  },
  {
    id: "workflow",
    title: "Workflow",
    body: "The approved tool runs, on its own or as one step of a workflow you built.",
  },
  {
    id: "result",
    title: "Result",
    body: "You get the answer, and a record of what happened is written to the log. The answer is information — it can never approve the next action.",
  },
] as const;

export interface WizardPoint {
  id: string;
  question: string;
  answer: string;
}

/** The ten things a person is told before a tool server is connected. */
export const CONNECTION_WIZARD_POINTS: readonly WizardPoint[] = [
  {
    id: "what",
    question: "What is MCP?",
    answer:
      "Model Context Protocol is a common language that lets an AI model use tools. Instead of the model guessing, it asks a tool server for a list of things it can do, and then asks for one of them by name.",
  },
  {
    id: "server",
    question: "What is a tool server, and where does it run?",
    answer:
      "It is an ordinary program. A local one runs on your Mac and is started by Nexus OS. A remote one is a web address you connect to. Local servers can reach your files; remote ones cannot, but they can see anything you send them.",
  },
  {
    id: "tools",
    question: "What are tools?",
    answer:
      "The individual actions a server offers, such as “search my notes” or “publish a post”. Nexus OS reads the list from the server and shows you every one before anything runs.",
  },
  {
    id: "impact",
    question: "How does Nexus OS decide what is risky?",
    answer:
      "Each tool is labelled by what it does to the world: reads information, creates or changes information, permanently removes or sends something, or changes your Mac or an account. If a tool cannot be classified, it is treated as a change — never as harmless.",
  },
  {
    id: "data",
    question: "What data can it reach?",
    answer:
      "Every tool lists what it can touch — your files, the web, your shop, your website — worked out from its name, its description and the values it asks for. That list is shown in the approval sheet before it runs.",
  },
  {
    id: "who",
    question: "Who can start a tool?",
    answer:
      "You can, and a model or a workflow can ask. Nothing else. Text inside a document, a web page or a tool's own answer is treated as information, never as an instruction — so a document cannot talk Nexus OS into running something.",
  },
  {
    id: "modes",
    question: "What are the five permission modes?",
    answer:
      "Disabled, Read Only, Ask Every Time, Allow Selected Actions and Trusted Workspace. A new connection starts on Ask Every Time. You can change it whenever you like.",
  },
  {
    id: "perTool",
    question: "Can I turn off individual tools?",
    answer:
      "Yes. Every tool has its own switch, and a tool you switch off cannot run in any mode — the off switch beats every other setting, including Trusted Workspace.",
  },
  {
    id: "record",
    question: "What is recorded?",
    answer:
      "Every suggestion, every decision, every approval, every refusal and every result. Anything that looks like a password or a key is removed before it is written, so the log is safe to read and to export.",
  },
  {
    id: "leave",
    question: "How do I test it, check it, or stop using it?",
    answer:
      "Use Test connection to check the server answers, the test console to try one tool by hand, and Remove to disconnect. Removing a connection deletes its tools and its settings from Nexus OS; it never deletes anything on the server.",
  },
] as const;

export interface PermissionModeCopy {
  mode: PermissionMode;
  title: string;
  explanation: string;
  /** What still asks, even in this mode. Never empty for the permissive modes. */
  stillAsks: string;
}

export const PERMISSION_MODE_COPY: readonly PermissionModeCopy[] = PERMISSION_MODES.map((mode) => ({
  mode,
  title: permissionModeTitle(mode),
  explanation: permissionModeExplanation(mode),
  stillAsks: stillAsksFor(mode),
}));

function stillAsksFor(mode: PermissionMode): string {
  switch (mode) {
    case "disabled":
      return "Nothing runs at all, including tools you previously allowed.";
    case "readOnly":
      return "Anything that would change, remove or send something is refused outright rather than asked about.";
    case "askEveryTime":
      return "Everything asks, every time.";
    case "allowSelected":
      return "Tools you have not ticked still ask, and anything permanent still asks even when ticked.";
    case "trustedWorkspace":
      return "Anything permanent still asks, and a tool that changes your Mac or an account still asks whenever a model — not you — requested it.";
  }
}

/** One-line summary used on the connection card and in the audit list. */
export const IMPACT_COPY = {
  read: { title: "Reads information", glyph: "◎", tone: "neutral" },
  write: { title: "Creates or changes information", glyph: "✎", tone: "caution" },
  destructive: { title: "Permanently removes or sends something", glyph: "⚠", tone: "critical" },
  system: { title: "Changes your Mac or an account", glyph: "⌘", tone: "critical" },
} as const;
