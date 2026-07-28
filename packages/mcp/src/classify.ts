import type { ActionImpact } from "@nexus/security";
import type { McpToolAnnotations, McpToolDefinition } from "./protocol.js";

/**
 * Impact classification.
 *
 * A tool server describes itself, and a hostile or careless one will describe
 * itself flatteringly. So the rule here is one-directional: a server's hints may
 * make a tool *more* restricted than the name suggests, never less. Anything the
 * classifier is unsure about is `write`, which means it is confirmed by default
 * under every mode except Trusted Workspace, and can never run under Read Only.
 */

interface Rule {
  readonly impact: ActionImpact;
  readonly words: readonly string[];
}

/** Deletes, sends, spends — anything a person could not take back. */
const DESTRUCTIVE_WORDS = [
  "delete", "destroy", "drop", "erase", "purge", "remove", "rm", "truncate", "wipe", "unlink",
  "revoke", "cancel", "refund", "charge", "pay", "payment", "transfer", "withdraw", "send",
  "email", "sms", "message", "post", "publish", "tweet", "deploy", "release", "merge", "push",
  "overwrite", "replace", "reset", "rollback", "archive", "unpublish", "unsubscribe", "ban",
  "terminate", "shutdown", "format", "empty", "clear",
] as const;

/**
 * Changes the machine or an account rather than data inside an app. Kept
 * deliberately narrow: generic words such as "update" belong to `write`, and
 * over-tagging as `system` would train people to click through confirmations.
 */
const SYSTEM_WORDS = [
  "install", "uninstall", "restart", "reboot", "sudo", "root", "admin",
  "permission", "privilege", "credential", "keychain", "secret", "token", "apikey", "password",
  "env", "environment", "registry", "daemon", "process", "kill", "spawn",
  "exec", "execute", "shell", "command", "script", "terminal",
  "chmod", "chown", "mount", "unmount", "firewall", "proxy", "launch", "quit",
] as const;

/** Looks at the world without touching it. */
const READ_WORDS = [
  "get", "read", "list", "search", "find", "query", "fetch", "view", "show", "describe",
  "inspect", "count", "check", "status", "lookup", "browse", "preview", "summary", "summarise",
  "summarize", "diff", "history", "log", "logs", "stat", "head", "tail", "resolve", "explain",
  "analyse", "analyze", "validate", "verify", "test", "ping", "who", "whoami", "info",
] as const;

/** Ordinary changes to data an app owns. */
const WRITE_WORDS = [
  "create", "add", "insert", "write", "set", "put", "patch", "edit", "modify", "change",
  "rename", "move", "copy", "upload", "save", "store", "append", "tag", "label", "assign",
  "update", "upgrade", "configure", "config", "setting", "settings",
  "schedule", "draft", "comment", "note", "sync", "import", "export", "convert", "generate",
] as const;

const RULES: readonly Rule[] = [
  { impact: "destructive", words: DESTRUCTIVE_WORDS },
  { impact: "system", words: SYSTEM_WORDS },
  { impact: "read", words: READ_WORDS },
  { impact: "write", words: WRITE_WORDS },
];

/** Splits `github.create_pull_request` / `createPullRequest` into words. */
export function tokenise(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length > 0);
}

function matches(tokens: readonly string[], words: readonly string[]): boolean {
  return tokens.some((token) => words.includes(token));
}

export interface ClassificationInput {
  name: string;
  description?: string;
  annotations?: McpToolAnnotations;
  inputSchema?: Record<string, unknown>;
}

export interface ToolClassification {
  impact: ActionImpact;
  /** Plain-language list of what the tool can reach, shown before it ever runs. */
  dataAccess: string[];
  /** Why the classifier chose this impact, for the connection log and the UI. */
  reason: string;
}

/**
 * Names win over hints, and the most dangerous match wins over the rest. A tool
 * called `delete_file` that claims `readOnlyHint: true` is still destructive.
 */
export function classifyImpact(input: ClassificationInput): { impact: ActionImpact; reason: string } {
  const annotations = input.annotations ?? {};
  const tokens = tokenise(input.name);

  if (annotations.destructiveHint === true) {
    return { impact: "destructive", reason: "The server declares this tool as destructive." };
  }

  for (const rule of RULES) {
    if (!matches(tokens, rule.words)) continue;
    if (rule.impact === "read") {
      // A read-sounding name that also contains a mutating word is not a read.
      if (matches(tokens, DESTRUCTIVE_WORDS)) {
        return { impact: "destructive", reason: "The tool name includes a word that removes or sends something." };
      }
      if (matches(tokens, WRITE_WORDS) || matches(tokens, SYSTEM_WORDS)) {
        return { impact: "write", reason: "The tool name mixes reading with changing, so it is treated as a change." };
      }
      if (annotations.readOnlyHint === false) {
        return { impact: "write", reason: "The server states this tool is not read-only." };
      }
      return { impact: "read", reason: "The tool name describes looking at information." };
    }
    return {
      impact: rule.impact,
      reason:
        rule.impact === "destructive"
          ? "The tool name includes a word that removes or sends something."
          : rule.impact === "system"
            ? "The tool name refers to your Mac, an account or a credential."
            : "The tool name describes creating or changing information.",
    };
  }

  if (annotations.readOnlyHint === true) {
    return { impact: "read", reason: "The server declares this tool as read-only." };
  }
  return {
    impact: "write",
    reason: "Nexus OS could not tell what this tool does, so it is treated as a change.",
  };
}

/* -------------------------------------------------------------------------- */
/* Data access                                                                 */
/* -------------------------------------------------------------------------- */

const ACCESS_SIGNALS: ReadonlyArray<{ label: string; words: readonly string[] }> = [
  { label: "Files and folders on this Mac", words: ["file", "files", "path", "directory", "folder", "fs", "filesystem", "read_file", "write_file"] },
  { label: "The web", words: ["url", "http", "https", "web", "fetch", "browse", "crawl", "page", "site", "request"] },
  { label: "Your email", words: ["email", "mail", "inbox", "gmail", "imap", "smtp", "message"] },
  { label: "Your calendar", words: ["calendar", "event", "meeting", "schedule", "appointment"] },
  { label: "Your contacts", words: ["contact", "contacts", "address", "people", "person"] },
  { label: "Code repositories", words: ["git", "github", "gitlab", "repo", "repository", "branch", "commit", "pull", "issue"] },
  { label: "A database", words: ["sql", "database", "db", "table", "query", "postgres", "mysql", "sqlite", "collection"] },
  { label: "Your shop and orders", words: ["shopify", "order", "orders", "product", "customer", "checkout", "inventory", "refund"] },
  { label: "Your website", words: ["wordpress", "wp", "post", "page", "media", "cms", "publish"] },
  { label: "Chat and messaging", words: ["slack", "discord", "chat", "channel", "dm"] },
  { label: "Money and payments", words: ["payment", "invoice", "charge", "stripe", "wallet", "balance", "transfer"] },
  { label: "Applications on this Mac", words: ["app", "application", "launch", "quit", "window", "process", "terminal", "shell"] },
  { label: "Credentials and settings", words: ["secret", "token", "credential", "keychain", "password", "apikey", "env", "config"] },
];

/** Collects the property names a tool's input schema declares. */
function schemaTokens(schema: Record<string, unknown> | undefined): string[] {
  if (!schema) return [];
  const properties = schema["properties"];
  if (properties === null || typeof properties !== "object") return [];
  return Object.keys(properties as Record<string, unknown>).flatMap((key) => tokenise(key));
}

/**
 * The list shown in the confirmation sheet: "It can reach: …". Derived from the
 * tool name, its description and its declared inputs, so a tool that takes a
 * `path` says so even when its description does not.
 */
export function inferDataAccess(input: ClassificationInput): string[] {
  const tokens = new Set([
    ...tokenise(input.name),
    ...tokenise(input.description ?? ""),
    ...schemaTokens(input.inputSchema),
  ]);
  const found: string[] = [];
  for (const signal of ACCESS_SIGNALS) {
    if (signal.words.some((word) => tokens.has(word))) found.push(signal.label);
  }
  if (input.annotations?.openWorldHint === true && !found.includes("The web")) {
    found.push("The web");
  }
  if (found.length === 0) found.push("Whatever this tool server is connected to");
  return found;
}

export function classifyTool(input: ClassificationInput): ToolClassification {
  const { impact, reason } = classifyImpact(input);
  return { impact, dataAccess: inferDataAccess(input), reason };
}

/** Convenience for a freshly discovered tool definition. */
export function classifyDefinition(definition: McpToolDefinition): ToolClassification {
  return classifyTool({
    name: definition.name,
    description: definition.description,
    annotations: definition.annotations,
    inputSchema: definition.inputSchema,
  });
}
