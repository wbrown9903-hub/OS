import {
  type ActionImpact,
  type AuditOutcome,
  type ContentOrigin,
  secretRedactor,
} from "@nexus/security";

/**
 * The append-only record of what was requested, what was decided and what
 * happened. Redaction is applied here, at the sink, so a call site that forgets
 * to wrap a value cannot leak a credential into the log — the same rule the Swift
 * `AuditLog` follows.
 */

export interface McpAuditRecord {
  id: string;
  timestamp: string;
  /** e.g. "mcp.filesystem.read_file" */
  subject: string;
  summary: string;
  impact: ActionImpact;
  requestOrigin: ContentOrigin;
  outcome: AuditOutcome;
  detail: string;
}

export interface McpAuditInput {
  subject: string;
  summary: string;
  impact: ActionImpact;
  requestOrigin: ContentOrigin;
  outcome: AuditOutcome;
  detail?: string;
}

let sequence = 0;

function nextId(): string {
  sequence += 1;
  return `mcpaudit_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export class McpAuditLog {
  private records: McpAuditRecord[] = [];

  constructor(
    private readonly options: {
      limit?: number;
      /** Persists the redacted record, e.g. into the AuditEvent table. */
      sink?: (record: McpAuditRecord) => void | Promise<void>;
      clock?: () => Date;
    } = {},
  ) {}

  record(input: McpAuditInput): McpAuditRecord {
    const safe: McpAuditRecord = {
      id: nextId(),
      timestamp: (this.options.clock?.() ?? new Date()).toISOString(),
      subject: input.subject,
      summary: secretRedactor.redact(input.summary),
      impact: input.impact,
      requestOrigin: input.requestOrigin,
      outcome: input.outcome,
      detail: secretRedactor.redact(input.detail ?? ""),
    };
    this.records.push(safe);
    const limit = this.options.limit ?? 5000;
    if (this.records.length > limit) this.records.splice(0, this.records.length - limit);
    void this.options.sink?.(safe);
    return safe;
  }

  get all(): McpAuditRecord[] {
    return [...this.records];
  }

  matching(subjectPrefix: string): McpAuditRecord[] {
    return this.records.filter((record) => record.subject.startsWith(subjectPrefix));
  }

  clear(): void {
    this.records = [];
  }
}

/* -------------------------------------------------------------------------- */
/* Connection log                                                              */
/* -------------------------------------------------------------------------- */

export type McpLogLevel = "info" | "warning" | "error";

export interface McpLogEntry {
  timestamp: string;
  level: McpLogLevel;
  serverId: string;
  message: string;
  /** Already redacted. Safe to render and to export. */
  detail: string;
}

/**
 * The per-connection log the MCP centre shows. Every message and every detail is
 * redacted on the way in, which is why the screen can display it verbatim.
 */
export class McpConnectionLog {
  private entries: McpLogEntry[] = [];

  constructor(private readonly options: { limit?: number; clock?: () => Date } = {}) {}

  append(entry: { level: McpLogLevel; serverId: string; message: string; detail?: unknown }): McpLogEntry {
    const detail =
      entry.detail === undefined
        ? ""
        : typeof entry.detail === "string"
          ? entry.detail
          : JSON.stringify(secretRedactor.redactJSON(entry.detail));
    const safe: McpLogEntry = {
      timestamp: (this.options.clock?.() ?? new Date()).toISOString(),
      level: entry.level,
      serverId: entry.serverId,
      message: secretRedactor.redact(entry.message),
      detail: secretRedactor.redact(detail),
    };
    this.entries.push(safe);
    const limit = this.options.limit ?? 500;
    if (this.entries.length > limit) this.entries.splice(0, this.entries.length - limit);
    return safe;
  }

  get all(): McpLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
