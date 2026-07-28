import type { ActionImpact } from "@nexus/security";

/**
 * The node catalogue.
 *
 * A node type is declared once, here, and everything else is derived from it:
 * the builder's palette, the port validation, the credential check, the dry-run
 * sentence, the impact shown before a run and the executor's dispatch. Adding a
 * node means adding one entry — there is no second place to update.
 */

export type PortType = "trigger" | "text" | "number" | "boolean" | "json" | "file" | "any";

export interface PortDefinition {
  id: string;
  label: string;
  type: PortType;
  /** A required input with no incoming edge and no literal makes the graph invalid. */
  required: boolean;
  help: string;
}

export type NodeCategory = "trigger" | "action" | "control";

export type SettingKind = "text" | "longText" | "number" | "boolean" | "select";

export interface SettingDefinition {
  key: string;
  label: string;
  help: string;
  kind: SettingKind;
  required: boolean;
  defaultValue: string | number | boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
}

/**
 * A capability or credential a node needs before it can run. The workflow screen
 * turns a missing one into "Connect Shopify" rather than a runtime failure.
 */
export type Requirement = "mcp" | "ai" | "bridge" | "shopify" | "wordpress" | "brain" | "webhook";

export interface NodeDefinition {
  kind: string;
  title: string;
  category: NodeCategory;
  /** One sentence a beginner can read in the palette. */
  summary: string;
  impact: ActionImpact;
  /** Lets a node be more dangerous depending on how it is configured. */
  impactFor?: (settings: Record<string, unknown>) => ActionImpact;
  inputs: readonly PortDefinition[];
  outputs: readonly PortDefinition[];
  settings: readonly SettingDefinition[];
  requires: readonly Requirement[];
  /** True when the engine can do this itself, with no runtime and no side effect. */
  pure: boolean;
  /** True when the run always pauses for a person, regardless of permission mode. */
  alwaysApproves: boolean;
  /** The sentence the dry-run planner prints: "It would …". */
  describe: (settings: Record<string, unknown>, label: string) => string;
}

const RUN_IN: PortDefinition = {
  id: "run",
  label: "Run",
  type: "trigger",
  required: true,
  help: "Connect the step that should come before this one.",
};

const DONE_OUT: PortDefinition = {
  id: "done",
  label: "Then",
  type: "trigger",
  required: false,
  help: "Connect what should happen after this step.",
};

const STARTED_OUT: PortDefinition = {
  id: "started",
  label: "Starts",
  type: "trigger",
  required: false,
  help: "Connect the first step of the workflow.",
};

function text(settings: Record<string, unknown>, key: string, fallback = ""): string {
  const value = settings[key];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function number(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = settings[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

const DEFINITIONS: readonly NodeDefinition[] = [
  /* ---------------------------------------------------------------- triggers */
  {
    kind: "trigger.manualButton",
    title: "Manual button",
    category: "trigger",
    summary: "You press a button to start this workflow.",
    impact: "read",
    inputs: [],
    outputs: [STARTED_OUT],
    settings: [
      { key: "buttonLabel", label: "Button label", help: "What the button says.", kind: "text", required: true, defaultValue: "Run" },
    ],
    requires: [],
    pure: true,
    alwaysApproves: false,
    describe: (settings) => `wait for you to press “${text(settings, "buttonLabel", "Run")}”`,
  },
  {
    kind: "trigger.schedule",
    title: "On a schedule",
    category: "trigger",
    summary: "Starts at a time you choose.",
    impact: "read",
    inputs: [],
    outputs: [STARTED_OUT, { id: "firedAt", label: "Time", type: "text", required: false, help: "When it started." }],
    settings: [
      {
        key: "every",
        label: "How often",
        help: "How frequently the workflow should start.",
        kind: "select",
        required: true,
        defaultValue: "day",
        options: [
          { value: "hour", label: "Every hour" },
          { value: "day", label: "Every day" },
          { value: "week", label: "Every week" },
        ],
      },
      { key: "atTime", label: "At", help: "24-hour time, for example 09:00.", kind: "text", required: false, defaultValue: "09:00" },
    ],
    requires: [],
    pure: true,
    alwaysApproves: false,
    describe: (settings) => `start every ${text(settings, "every", "day")} at ${text(settings, "atTime", "09:00")}`,
  },
  {
    kind: "trigger.shortcut",
    title: "Keyboard shortcut",
    category: "trigger",
    summary: "Starts when you press a key combination.",
    impact: "read",
    inputs: [],
    outputs: [STARTED_OUT],
    settings: [
      { key: "shortcut", label: "Shortcut", help: "For example ⌘⌥N.", kind: "text", required: true, defaultValue: "" },
    ],
    requires: ["bridge"],
    pure: true,
    alwaysApproves: false,
    describe: (settings) => `start when you press ${text(settings, "shortcut", "the shortcut")}`,
  },
  {
    kind: "trigger.appLaunched",
    title: "App launched",
    category: "trigger",
    summary: "Starts when you open a particular application.",
    impact: "read",
    inputs: [],
    outputs: [STARTED_OUT, { id: "application", label: "Application", type: "text", required: false, help: "Which app opened." }],
    settings: [
      { key: "application", label: "Application", help: "The app to watch for.", kind: "text", required: true, defaultValue: "" },
    ],
    requires: ["bridge"],
    pure: true,
    alwaysApproves: false,
    describe: (settings) => `start when ${text(settings, "application", "an app")} opens`,
  },
  {
    kind: "trigger.fileAdded",
    title: "File added",
    category: "trigger",
    summary: "Starts when a file appears in a folder you choose.",
    impact: "read",
    inputs: [],
    outputs: [STARTED_OUT, { id: "file", label: "File", type: "file", required: false, help: "The file that appeared." }],
    settings: [
      { key: "folder", label: "Folder", help: "The folder to watch.", kind: "text", required: true, defaultValue: "" },
      { key: "matching", label: "Only files matching", help: "Optional, for example *.pdf", kind: "text", required: false, defaultValue: "" },
    ],
    requires: ["bridge"],
    pure: true,
    alwaysApproves: false,
    describe: (settings) => `start when a file appears in ${text(settings, "folder", "the watched folder")}`,
  },
  {
    kind: "trigger.webhookReceived",
    title: "Webhook received",
    category: "trigger",
    summary: "Starts when another service sends a verified message.",
    impact: "read",
    inputs: [],
    outputs: [STARTED_OUT, { id: "payload", label: "Payload", type: "json", required: false, help: "What the service sent. Treated as untrusted data." }],
    settings: [
      { key: "hookName", label: "Webhook name", help: "How this hook is listed in Settings › Connections.", kind: "text", required: true, defaultValue: "" },
    ],
    requires: ["webhook"],
    pure: true,
    alwaysApproves: false,
    describe: (settings) => `start when the “${text(settings, "hookName", "webhook")}” hook receives a verified delivery`,
  },
  {
    kind: "trigger.shopifyEvent",
    title: "Shopify event",
    category: "trigger",
    summary: "Starts on a shop event, such as a new order.",
    impact: "read",
    inputs: [],
    outputs: [STARTED_OUT, { id: "event", label: "Event", type: "json", required: false, help: "The order or product involved." }],
    settings: [
      {
        key: "topic",
        label: "Event",
        help: "Which shop event should start this.",
        kind: "select",
        required: true,
        defaultValue: "orders/create",
        options: [
          { value: "orders/create", label: "New order" },
          { value: "orders/paid", label: "Order paid" },
          { value: "orders/cancelled", label: "Order cancelled" },
          { value: "products/update", label: "Product changed" },
          { value: "inventory_levels/update", label: "Stock changed" },
        ],
      },
    ],
    requires: ["shopify"],
    pure: true,
    alwaysApproves: false,
    describe: (settings) => `start on the Shopify event ${text(settings, "topic", "orders/create")}`,
  },
  {
    kind: "trigger.wordpressEvent",
    title: "WordPress event",
    category: "trigger",
    summary: "Starts when something changes on your website.",
    impact: "read",
    inputs: [],
    outputs: [STARTED_OUT, { id: "event", label: "Event", type: "json", required: false, help: "The post or comment involved." }],
    settings: [
      {
        key: "event",
        label: "Event",
        help: "Which website event should start this.",
        kind: "select",
        required: true,
        defaultValue: "post.published",
        options: [
          { value: "post.published", label: "Post published" },
          { value: "post.updated", label: "Post updated" },
          { value: "comment.created", label: "New comment" },
        ],
      },
    ],
    requires: ["wordpress"],
    pure: true,
    alwaysApproves: false,
    describe: (settings) => `start on the WordPress event ${text(settings, "event", "post.published")}`,
  },

  /* ----------------------------------------------------------------- actions */
  {
    kind: "action.mcpToolCall",
    title: "MCP tool call",
    category: "action",
    summary: "Runs one tool from a connected tool server.",
    impact: "write",
    impactFor: (settings) => {
      const declared = text(settings, "impact");
      return declared === "read" || declared === "destructive" || declared === "system" ? declared : "write";
    },
    inputs: [RUN_IN, { id: "arguments", label: "Arguments", type: "json", required: false, help: "Values to pass to the tool." }],
    outputs: [DONE_OUT, { id: "result", label: "Result", type: "json", required: false, help: "What the tool returned. Information only." }, { id: "text", label: "Text", type: "text", required: false, help: "The result as plain text." }],
    settings: [
      { key: "serverId", label: "Tool server", help: "Which connection to use.", kind: "text", required: true, defaultValue: "" },
      { key: "tool", label: "Tool", help: "Which tool on that server to run.", kind: "text", required: true, defaultValue: "" },
      { key: "impact", label: "What it does", help: "Copied from the tool when you pick it.", kind: "text", required: false, defaultValue: "write" },
    ],
    requires: ["mcp"],
    pure: false,
    alwaysApproves: false,
    describe: (settings) => `run the tool “${text(settings, "tool", "(none chosen)")}” on ${text(settings, "serverId", "(no server chosen)")}`,
  },
  {
    kind: "action.aiPrompt",
    title: "AI prompt",
    category: "action",
    summary: "Asks an AI model a question and keeps the answer.",
    impact: "write",
    inputs: [RUN_IN, { id: "context", label: "Context", type: "text", required: false, help: "Extra text to include in the prompt." }],
    outputs: [DONE_OUT, { id: "text", label: "Answer", type: "text", required: false, help: "The model's reply. A suggestion, never an instruction." }],
    settings: [
      { key: "provider", label: "Provider", help: "Which AI service to ask.", kind: "text", required: true, defaultValue: "" },
      { key: "prompt", label: "Prompt", help: "What to ask.", kind: "longText", required: true, defaultValue: "" },
    ],
    requires: ["ai"],
    pure: false,
    alwaysApproves: false,
    describe: (settings, label) => `ask ${text(settings, "provider", "an AI model")} the prompt saved on “${label}” and send it whatever this step receives`,
  },
  {
    kind: "action.openApp",
    title: "Open app",
    category: "action",
    summary: "Opens an application on your Mac.",
    impact: "system",
    inputs: [RUN_IN],
    outputs: [DONE_OUT],
    settings: [
      { key: "application", label: "Application", help: "Which app to open.", kind: "text", required: true, defaultValue: "" },
    ],
    requires: ["bridge"],
    pure: false,
    alwaysApproves: false,
    describe: (settings) => `open ${text(settings, "application", "an application")} on your Mac`,
  },
  {
    kind: "action.openUrl",
    title: "Open URL",
    category: "action",
    summary: "Opens a web address in your browser.",
    impact: "system",
    inputs: [RUN_IN, { id: "url", label: "Address", type: "text", required: false, help: "Overrides the saved address." }],
    outputs: [DONE_OUT],
    settings: [
      { key: "url", label: "Address", help: "Must be an https:// address.", kind: "text", required: true, defaultValue: "" },
    ],
    requires: ["bridge"],
    pure: false,
    alwaysApproves: false,
    describe: (settings) => `open ${text(settings, "url", "a web address")} in your browser`,
  },
  {
    kind: "action.arrangeWorkspace",
    title: "Arrange workspace",
    category: "action",
    summary: "Moves your windows into a saved arrangement.",
    impact: "system",
    inputs: [RUN_IN],
    outputs: [DONE_OUT],
    settings: [
      { key: "workspace", label: "Workspace", help: "Which saved arrangement to restore.", kind: "text", required: true, defaultValue: "" },
    ],
    requires: ["bridge"],
    pure: false,
    alwaysApproves: false,
    describe: (settings) => `arrange your windows into the “${text(settings, "workspace", "chosen")}” workspace`,
  },
  {
    kind: "action.notification",
    title: "Notification",
    category: "action",
    summary: "Shows you a message.",
    impact: "write",
    inputs: [RUN_IN, { id: "body", label: "Message", type: "text", required: false, help: "Overrides the saved message." }],
    outputs: [DONE_OUT],
    settings: [
      { key: "title", label: "Title", help: "The headline of the notification.", kind: "text", required: true, defaultValue: "" },
      { key: "body", label: "Message", help: "The body text.", kind: "longText", required: false, defaultValue: "" },
    ],
    requires: [],
    pure: false,
    alwaysApproves: false,
    describe: (settings) => `show you a notification titled “${text(settings, "title", "(no title)")}”`,
  },
  {
    kind: "action.sound",
    title: "Play a sound",
    category: "action",
    summary: "Plays a short sound.",
    impact: "write",
    inputs: [RUN_IN],
    outputs: [DONE_OUT],
    settings: [
      {
        key: "sound",
        label: "Sound",
        help: "Which sound to play.",
        kind: "select",
        required: true,
        defaultValue: "chime",
        options: [
          { value: "chime", label: "Chime" },
          { value: "sale", label: "Sale" },
          { value: "alert", label: "Alert" },
        ],
      },
    ],
    requires: [],
    pure: false,
    alwaysApproves: false,
    describe: (settings) => `play the ${text(settings, "sound", "chime")} sound`,
  },
  {
    kind: "action.addKnowledgeItem",
    title: "Add knowledge item",
    category: "action",
    summary: "Saves something into Nexus Brain.",
    impact: "write",
    inputs: [RUN_IN, { id: "content", label: "Content", type: "text", required: true, help: "The text to save." }],
    outputs: [DONE_OUT, { id: "item", label: "Item", type: "json", required: false, help: "The saved item." }],
    settings: [
      { key: "title", label: "Title", help: "What to call the saved item.", kind: "text", required: true, defaultValue: "" },
      { key: "project", label: "Project", help: "Optional project to file it under.", kind: "text", required: false, defaultValue: "" },
    ],
    requires: ["brain"],
    pure: false,
    alwaysApproves: false,
    describe: (settings) => `save a knowledge item called “${text(settings, "title", "(no title)")}” into Nexus Brain`,
  },
  {
    kind: "action.searchMemory",
    title: "Search memory",
    category: "action",
    summary: "Looks something up in Nexus Brain.",
    impact: "read",
    inputs: [RUN_IN, { id: "query", label: "Query", type: "text", required: true, help: "What to search for." }],
    outputs: [DONE_OUT, { id: "results", label: "Results", type: "json", required: false, help: "What was found." }],
    settings: [
      { key: "limit", label: "How many results", help: "Maximum number of matches to return.", kind: "number", required: false, defaultValue: 5 },
    ],
    requires: ["brain"],
    pure: false,
    alwaysApproves: false,
    describe: (settings) => `search Nexus Brain and keep the top ${number(settings, "limit", 5)} results`,
  },
  {
    kind: "action.requestApproval",
    title: "Request approval",
    category: "action",
    summary: "Pauses and waits for you to say yes or no.",
    impact: "read",
    inputs: [RUN_IN, { id: "details", label: "Details", type: "text", required: false, help: "Extra context to show you." }],
    outputs: [
      { id: "approved", label: "If approved", type: "trigger", required: false, help: "Runs when you approve." },
      { id: "rejected", label: "If declined", type: "trigger", required: false, help: "Runs when you decline." },
    ],
    settings: [
      { key: "question", label: "Question", help: "What to ask you.", kind: "text", required: true, defaultValue: "" },
    ],
    requires: [],
    pure: true,
    alwaysApproves: true,
    describe: (settings) => `pause and ask you: “${text(settings, "question", "(no question set)")}”`,
  },
  {
    kind: "control.conditionalBranch",
    title: "Conditional branch",
    category: "control",
    summary: "Sends the workflow one way or the other.",
    impact: "read",
    inputs: [RUN_IN, { id: "value", label: "Value", type: "any", required: true, help: "The value to test." }],
    outputs: [
      { id: "whenTrue", label: "If true", type: "trigger", required: false, help: "Runs when the test passes." },
      { id: "whenFalse", label: "If false", type: "trigger", required: false, help: "Runs when the test fails." },
    ],
    settings: [
      {
        key: "operator",
        label: "Test",
        help: "How to compare the value.",
        kind: "select",
        required: true,
        defaultValue: "isTrue",
        options: [
          { value: "isTrue", label: "is true" },
          { value: "isEmpty", label: "is empty" },
          { value: "equals", label: "equals" },
          { value: "contains", label: "contains" },
          { value: "greaterThan", label: "is greater than" },
        ],
      },
      { key: "comparand", label: "Compared with", help: "The value to compare against.", kind: "text", required: false, defaultValue: "" },
    ],
    requires: [],
    pure: true,
    alwaysApproves: false,
    describe: (settings) =>
      `check whether the value ${text(settings, "operator", "isTrue")} ${text(settings, "comparand", "")}`.trimEnd(),
  },
  {
    kind: "control.delay",
    title: "Delay",
    category: "control",
    summary: "Waits before continuing.",
    impact: "read",
    inputs: [RUN_IN],
    outputs: [DONE_OUT],
    settings: [
      { key: "seconds", label: "Wait for", help: "How many seconds to wait.", kind: "number", required: true, defaultValue: 5 },
    ],
    requires: [],
    pure: true,
    alwaysApproves: false,
    describe: (settings) => `wait ${number(settings, "seconds", 5)} seconds`,
  },
  {
    kind: "action.transformData",
    title: "Transform data",
    category: "action",
    summary: "Reshapes a value without touching anything outside the workflow.",
    impact: "read",
    inputs: [RUN_IN, { id: "input", label: "Input", type: "any", required: true, help: "The value to reshape." }],
    outputs: [DONE_OUT, { id: "output", label: "Output", type: "any", required: false, help: "The reshaped value." }],
    settings: [
      {
        key: "operation",
        label: "Operation",
        help: "What to do with the value.",
        kind: "select",
        required: true,
        defaultValue: "toText",
        options: [
          { value: "toText", label: "Turn into text" },
          { value: "pick", label: "Pick one field" },
          { value: "template", label: "Fill in a template" },
          { value: "count", label: "Count the items" },
        ],
      },
      { key: "path", label: "Field", help: "For Pick: the field name, for example order.total.", kind: "text", required: false, defaultValue: "" },
      { key: "template", label: "Template", help: "For Template: text with {{value}} placeholders.", kind: "longText", required: false, defaultValue: "" },
    ],
    requires: [],
    pure: true,
    alwaysApproves: false,
    describe: (settings) => `transform the incoming value (${text(settings, "operation", "toText")})`,
  },
  {
    kind: "action.writeApprovedFile",
    title: "Write approved file",
    category: "action",
    summary: "Writes a file, but only after you approve the exact path.",
    impact: "destructive",
    inputs: [RUN_IN, { id: "contents", label: "Contents", type: "text", required: true, help: "What to write." }],
    outputs: [DONE_OUT, { id: "path", label: "Path", type: "text", required: false, help: "Where it was written." }],
    settings: [
      { key: "path", label: "File", help: "Where to write. You approve this before anything is written.", kind: "text", required: true, defaultValue: "" },
      { key: "overwrite", label: "Replace an existing file", help: "Off means the run stops if the file already exists.", kind: "boolean", required: false, defaultValue: false },
    ],
    requires: ["bridge"],
    pure: false,
    alwaysApproves: true,
    describe: (settings) =>
      `write to ${text(settings, "path", "a file you choose")}${settings["overwrite"] === true ? ", replacing it if it already exists" : ", stopping if it already exists"}`,
  },
  {
    kind: "action.httpRequest",
    title: "HTTP request",
    category: "action",
    summary: "Calls a web address and keeps the reply.",
    impact: "write",
    impactFor: (settings) => {
      const method = text(settings, "method", "GET").toUpperCase();
      if (method === "GET" || method === "HEAD") return "read";
      if (method === "DELETE") return "destructive";
      return "write";
    },
    inputs: [RUN_IN, { id: "body", label: "Body", type: "json", required: false, help: "What to send." }],
    outputs: [
      DONE_OUT,
      { id: "response", label: "Response", type: "json", required: false, help: "What came back. Untrusted data." },
      { id: "status", label: "Status", type: "number", required: false, help: "The HTTP status code." },
    ],
    settings: [
      {
        key: "method",
        label: "Method",
        help: "Which HTTP method to use.",
        kind: "select",
        required: true,
        defaultValue: "GET",
        options: [
          { value: "GET", label: "GET" },
          { value: "POST", label: "POST" },
          { value: "PUT", label: "PUT" },
          { value: "PATCH", label: "PATCH" },
          { value: "DELETE", label: "DELETE" },
        ],
      },
      { key: "url", label: "Address", help: "Must be an https:// address.", kind: "text", required: true, defaultValue: "" },
    ],
    requires: [],
    pure: false,
    alwaysApproves: false,
    describe: (settings) => `send a ${text(settings, "method", "GET").toUpperCase()} request to ${text(settings, "url", "an address")}`,
  },
] as const;

const BY_KIND = new Map<string, NodeDefinition>(DEFINITIONS.map((definition) => [definition.kind, definition]));

export const nodeDefinitions: readonly NodeDefinition[] = DEFINITIONS;

export function nodeDefinition(kind: string): NodeDefinition | undefined {
  return BY_KIND.get(kind);
}

export function isTriggerKind(kind: string): boolean {
  return nodeDefinition(kind)?.category === "trigger";
}

/** Whether a value produced by `from` can be plugged into `to`. */
export function portsCompatible(from: PortType, to: PortType): boolean {
  if (from === to) return true;
  if (from === "trigger" || to === "trigger") return false;
  if (from === "any" || to === "any") return true;
  if (to === "text") return from === "number" || from === "boolean" || from === "json" || from === "file";
  if (to === "json") return from === "file";
  return false;
}

export function inputPort(kind: string, portId: string): PortDefinition | undefined {
  return nodeDefinition(kind)?.inputs.find((port) => port.id === portId);
}

export function outputPort(kind: string, portId: string): PortDefinition | undefined {
  return nodeDefinition(kind)?.outputs.find((port) => port.id === portId);
}

/** Human-readable label for a requirement, used by the "missing credential" error. */
export function requirementLabel(requirement: Requirement): string {
  switch (requirement) {
    case "mcp":
      return "a connected MCP tool server";
    case "ai":
      return "an AI provider";
    case "bridge":
      return "Nexus Desktop running on your Mac";
    case "shopify":
      return "your Shopify connection";
    case "wordpress":
      return "your WordPress connection";
    case "brain":
      return "Nexus Brain";
    case "webhook":
      return "a configured webhook";
  }
}

export function requirementFixHref(requirement: Requirement): string {
  switch (requirement) {
    case "mcp":
      return "/mcp";
    case "bridge":
      return "/settings/desktop";
    case "brain":
      return "/brain";
    default:
      return "/settings/connections";
  }
}
