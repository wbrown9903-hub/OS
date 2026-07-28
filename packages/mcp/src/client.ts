import { NexusError, type ToolDescriptor, toNexusError } from "@nexus/security";
import { McpConnectionLog, type McpLogEntry } from "./audit.js";
import { classifyDefinition } from "./classify.js";
import {
  type JsonRpcId,
  type JsonRpcInbound,
  type JsonRpcResponse,
  type McpInitializeResult,
  type McpToolDefinition,
  type McpToolResult,
  MCP_PROTOCOL_VERSION,
  NEXUS_CLIENT_INFO,
  errorFromRpc,
  isResponse,
  notification,
  parseInitializeResult,
  parseToolListPage,
  parseToolResult,
  request,
} from "./protocol.js";
import type { McpTransport } from "./transport.js";

/**
 * The MCP client.
 *
 * Responsibilities: the initialise handshake, tool discovery, tool invocation,
 * timeouts, bounded retry with backoff, a clean shutdown and an honest health
 * state. It deliberately does *not* decide whether a call is permitted — that is
 * `pipeline.ts`, and keeping the two apart is what stops a future contributor
 * calling `callTool` and skipping the permission engine by accident.
 */

export type McpConnectionState =
  | "notConfigured"
  | "connecting"
  | "connected"
  | "degraded"
  | "disconnected"
  | "failed";

export interface McpHealth {
  state: McpConnectionState;
  /** Plain-language description of the state, ready to render. */
  summary: string;
  lastConnectedAt: string | null;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
  lastError: { message: string; recovery: string; code: string } | null;
  serverInfo: { name: string; version: string; protocolVersion: string } | null;
}

export interface McpClientOptions {
  serverId: string;
  serverName: string;
  transport: McpTransport;
  /** Per-request budget. The connection record's default is 30 seconds. */
  timeoutMs?: number;
  /** Extra attempts after the first. 0 means "try once". */
  maxRetries?: number;
  /** First backoff delay; doubles each attempt. */
  backoffMs?: number;
  log?: McpConnectionLog;
  clock?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface Pending {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: NexusError) => void;
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    // Never hold a Node process open just to wait out a backoff.
    (timer as unknown as { unref?: () => void }).unref?.();
  });

export class McpClient {
  readonly serverId: string;
  readonly serverName: string;
  readonly log: McpConnectionLog;

  private readonly transport: McpTransport;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly clock: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  private pending = new Map<JsonRpcId, Pending>();
  private nextId = 1;
  private started = false;
  private initialised: McpInitializeResult | null = null;
  private state: McpConnectionState = "notConfigured";
  private lastConnectedAt: string | null = null;
  private lastCheckedAt: string | null = null;
  private lastLatencyMs: number | null = null;
  private consecutiveFailures = 0;
  private lastError: NexusError | null = null;

  constructor(options: McpClientOptions) {
    this.serverId = options.serverId;
    this.serverName = options.serverName;
    this.transport = options.transport;
    this.timeoutMs = Math.max(250, options.timeoutMs ?? 30_000);
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.backoffMs = Math.max(1, options.backoffMs ?? 250);
    this.log = options.log ?? new McpConnectionLog();
    this.clock = options.clock ?? (() => new Date());
    this.sleep = options.sleep ?? defaultSleep;
  }

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                              */
  /* ---------------------------------------------------------------------- */

  /** Opens the transport and performs the MCP initialise handshake. */
  async connect(): Promise<McpInitializeResult> {
    if (this.initialised) return this.initialised;
    this.state = "connecting";
    this.note("info", `Connecting to ${this.transport.describe}`);

    try {
      if (!this.started) {
        await this.transport.start({
          message: (message) => this.receive(message),
          failed: (error) => this.fail(error),
          closed: (reason) => this.handleClosed(reason),
        });
        this.started = true;
      }

      const began = Date.now();
      const result = parseInitializeResult(
        await this.send("initialize", {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {}, roots: { listChanged: false } },
          clientInfo: NEXUS_CLIENT_INFO,
        }),
      );
      await this.notify("notifications/initialized");

      this.initialised = result;
      this.state = "connected";
      this.lastConnectedAt = this.clock().toISOString();
      this.lastCheckedAt = this.lastConnectedAt;
      this.lastLatencyMs = Date.now() - began;
      this.consecutiveFailures = 0;
      this.lastError = null;
      this.note(
        "info",
        `Connected to ${result.serverInfo.name} ${result.serverInfo.version} (protocol ${result.protocolVersion})`,
      );
      return result;
    } catch (error) {
      const failure = toNexusError(error);
      this.fail(failure);
      throw failure;
    }
  }

  /** Ends the session and releases the child process or HTTP session. */
  async shutdown(): Promise<void> {
    for (const [id, pending] of this.pending) {
      pending.reject(
        new NexusError(
          "cancelled",
          "connectionClosed",
          `The connection to “${this.serverName}” closed before that finished.`,
          "Choose Reconnect on this connection, then try again.",
        ),
      );
      this.pending.delete(id);
    }
    this.initialised = null;
    if (this.started) {
      await this.transport.close();
      this.started = false;
    }
    this.state = "disconnected";
    this.note("info", "Disconnected");
  }

  /* ---------------------------------------------------------------------- */
  /* Discovery and invocation                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * `tools/list`, following pagination cursors. Each tool comes back with a
   * conservative impact classification and a declared data-access list, because a
   * tool that has not been classified must never reach the permission engine.
   */
  async listTools(): Promise<Array<{ definition: McpToolDefinition; descriptor: ToolDescriptor; reason: string }>> {
    await this.connect();
    const discovered: Array<{ definition: McpToolDefinition; descriptor: ToolDescriptor; reason: string }> = [];
    let cursor: string | null = null;
    // A server that keeps handing back cursors must not spin forever.
    for (let page = 0; page < 50; page += 1) {
      const raw: unknown = await this.send("tools/list", cursor ? { cursor } : {});
      const parsed = parseToolListPage(raw);
      for (const definition of parsed.tools) {
        const classification = classifyDefinition(definition);
        discovered.push({
          definition,
          reason: classification.reason,
          descriptor: {
            id: `${this.serverId}:${definition.name}`,
            name: definition.name,
            description: definition.description || "This tool server gave no description.",
            impact: classification.impact,
            dataAccess: classification.dataAccess,
          },
        });
      }
      cursor = parsed.nextCursor;
      if (!cursor) break;
    }
    this.note("info", `Discovered ${discovered.length} tool${discovered.length === 1 ? "" : "s"}`);
    return discovered;
  }

  /**
   * `tools/call`. Callable only from the pipeline in normal operation — nothing
   * here checks permissions, by design.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.connect();
    const began = Date.now();
    const raw = await this.send("tools/call", { name, arguments: args });
    this.lastLatencyMs = Date.now() - began;
    this.lastCheckedAt = this.clock().toISOString();
    return parseToolResult(raw);
  }

  /** A cheap round trip used by the Test connection button. */
  async ping(): Promise<number> {
    const began = Date.now();
    await this.connect();
    await this.send("tools/list", {});
    const elapsed = Date.now() - began;
    this.lastLatencyMs = elapsed;
    this.lastCheckedAt = this.clock().toISOString();
    return elapsed;
  }

  /* ---------------------------------------------------------------------- */
  /* Health                                                                 */
  /* ---------------------------------------------------------------------- */

  get health(): McpHealth {
    return {
      state: this.state,
      summary: healthSummary(this.state, this.serverName, this.consecutiveFailures),
      lastConnectedAt: this.lastConnectedAt,
      lastCheckedAt: this.lastCheckedAt,
      lastLatencyMs: this.lastLatencyMs,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError
        ? {
            message: this.lastError.message,
            recovery: this.lastError.recovery,
            code: this.lastError.qualifiedCode,
          }
        : null,
      serverInfo: this.initialised
        ? {
            name: this.initialised.serverInfo.name,
            version: this.initialised.serverInfo.version,
            protocolVersion: this.initialised.protocolVersion,
          }
        : null,
    };
  }

  get entries(): McpLogEntry[] {
    return this.log.all;
  }

  /* ---------------------------------------------------------------------- */
  /* Transport plumbing                                                     */
  /* ---------------------------------------------------------------------- */

  /** One request, with a timeout and bounded retry-with-backoff around it. */
  private async send(method: string, params: Record<string, unknown>): Promise<unknown> {
    let attempt = 0;
    let lastFailure: NexusError | null = null;
    for (;;) {
      try {
        const response = await this.sendOnce(method, params);
        if (response.error) throw errorFromRpc(response.error, this.serverName);
        this.consecutiveFailures = 0;
        if (this.state === "degraded") this.state = "connected";
        return response.result ?? null;
      } catch (error) {
        const failure = toNexusError(error);
        lastFailure = failure;
        this.consecutiveFailures += 1;
        this.note("warning", `${method} failed`, failure.description);

        if (!isRetryable(failure) || attempt >= this.maxRetries) break;
        const delay = this.backoffMs * 2 ** attempt;
        this.state = "degraded";
        this.note("info", `Retrying ${method} in ${delay}ms (attempt ${attempt + 2} of ${this.maxRetries + 1})`);
        await this.sleep(delay);
        attempt += 1;
      }
    }
    const failure =
      lastFailure ??
      new NexusError(
        "network",
        "unknownFailure",
        `“${this.serverName}” did not answer.`,
        "Choose Reconnect on this connection, then try again.",
      );
    this.fail(failure);
    throw failure;
  }

  private async sendOnce(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = this.nextId;
    this.nextId += 1;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const settled = new Promise<JsonRpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new NexusError(
            "network",
            "toolServerTimeout",
            `“${this.serverName}” did not answer within ${Math.round(this.timeoutMs / 1000)} seconds.`,
            "Check the tool server is still running, then choose Reconnect on this connection.",
            { method },
          ),
        );
      }, this.timeoutMs);
      (timer as unknown as { unref?: () => void }).unref?.();
    });

    try {
      await this.transport.send(request(id, method, params));
      return await settled;
    } finally {
      if (timer) clearTimeout(timer);
      this.pending.delete(id);
    }
  }

  private async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    await this.transport.send(notification(method, params));
  }

  private receive(message: JsonRpcInbound): void {
    if (!isResponse(message)) {
      this.note("info", `Notice from ${this.serverName}: ${message.method}`);
      return;
    }
    if (message.id === null) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    pending.resolve(message);
  }

  private handleClosed(reason: string): void {
    this.initialised = null;
    this.started = false;
    for (const [id, pending] of this.pending) {
      pending.reject(
        new NexusError(
          "network",
          "connectionLost",
          `The connection to “${this.serverName}” ended: ${reason}.`,
          "Choose Reconnect on this connection, then try again.",
        ),
      );
      this.pending.delete(id);
    }
    if (this.state !== "disconnected") this.state = "disconnected";
    this.note("warning", `Connection closed — ${reason}`);
  }

  private fail(error: NexusError): void {
    this.lastError = error;
    this.lastCheckedAt = this.clock().toISOString();
    this.state = "failed";
    this.note("error", error.message, error.recovery);
  }

  private note(level: "info" | "warning" | "error", message: string, detail?: unknown): void {
    this.log.append({ level, serverId: this.serverId, message, ...(detail === undefined ? {} : { detail }) });
  }
}

/** Only transport-shaped failures are worth repeating; a rejected argument is not. */
export function isRetryable(error: NexusError): boolean {
  if (error.domain === "network") return true;
  return error.domain === "integration" && (error.code === "rpc-32603" || error.code === "toolServerError");
}

export function healthSummary(state: McpConnectionState, serverName: string, failures: number): string {
  switch (state) {
    case "notConfigured":
      return `${serverName} has not been connected yet.`;
    case "connecting":
      return `Connecting to ${serverName}…`;
    case "connected":
      return `${serverName} is connected and answering.`;
    case "degraded":
      return `${serverName} is answering slowly or intermittently (${failures} recent failure${failures === 1 ? "" : "s"}).`;
    case "disconnected":
      return `${serverName} is not connected.`;
    case "failed":
      return `${serverName} could not be reached.`;
  }
}
