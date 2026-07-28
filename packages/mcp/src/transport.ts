import { NexusError, validateFetchTarget, validateLocalService } from "@nexus/security";
import {
  type JsonRpcInbound,
  type JsonRpcOutbound,
  type JsonRpcRequest,
  type JsonRpcResponse,
  decodeMessage,
  encodeMessage,
  isRequest,
} from "./protocol.js";

/**
 * Transports.
 *
 * The client never knows how bytes reach the server. That is what lets the unit
 * tests drive the entire protocol, permission and audit pipeline through an
 * in-memory double with no child process and no network, and it is what lets a
 * local program and a remote HTTP service share one code path.
 */

export type McpTransportKind = "stdio" | "http" | "memory";

export interface McpTransportEvents {
  /** A JSON-RPC response or a server notification arrived. */
  message(message: JsonRpcInbound): void;
  /** The transport itself failed. The client turns this into a health change. */
  failed(error: NexusError): void;
  /** The connection ended, whether we asked for it or not. */
  closed(reason: string): void;
}

export interface McpTransport {
  readonly kind: McpTransportKind;
  /** Safe-to-log description. Never contains a credential. */
  readonly describe: string;
  start(events: McpTransportEvents): Promise<void>;
  send(message: JsonRpcOutbound): Promise<void>;
  close(): Promise<void>;
}

function transportFailure(code: string, message: string, recovery: string, detail?: string): NexusError {
  return new NexusError("network", code, message, recovery, detail ? { detail } : {});
}

/* -------------------------------------------------------------------------- */
/* In-memory transport — the test double, and the shape of a server            */
/* -------------------------------------------------------------------------- */

export type InMemoryResponder = (
  request: JsonRpcRequest,
) => JsonRpcResponse | null | Promise<JsonRpcResponse | null>;

export interface InMemoryTransportOptions {
  describe?: string;
  /** Notifications the double should push once the connection is open. */
  onStart?: (emit: (message: JsonRpcInbound) => void) => void;
}

/**
 * A transport backed by a function. Returning `null` models a server that never
 * answers (so the client's timeout is exercised); throwing models a dropped
 * connection (so the retry and backoff path is exercised).
 */
export class InMemoryTransport implements McpTransport {
  readonly kind = "memory" as const;
  readonly describe: string;
  /** Everything the client sent, in order. Assertions read this directly. */
  readonly sent: JsonRpcOutbound[] = [];

  private events: McpTransportEvents | null = null;
  private open = false;

  constructor(
    private readonly responder: InMemoryResponder,
    private readonly options: InMemoryTransportOptions = {},
  ) {
    this.describe = options.describe ?? "in-memory tool server";
  }

  async start(events: McpTransportEvents): Promise<void> {
    this.events = events;
    this.open = true;
    this.options.onStart?.((message) => {
      if (this.open) events.message(message);
    });
  }

  async send(message: JsonRpcOutbound): Promise<void> {
    if (!this.open) {
      throw transportFailure(
        "transportClosed",
        "That tool server is no longer connected.",
        "Open Settings › MCP and choose Reconnect.",
      );
    }
    this.sent.push(message);
    if (!isRequest(message)) return;
    const reply = await this.responder(message);
    if (reply === null) return;
    this.events?.message(reply);
  }

  async close(): Promise<void> {
    if (!this.open) return;
    this.open = false;
    this.events?.closed("closed by Nexus OS");
  }

  /** Lets a test end the connection the way a crashed server would. */
  simulateCrash(reason = "the tool server stopped unexpectedly"): void {
    this.open = false;
    this.events?.closed(reason);
  }
}

/* -------------------------------------------------------------------------- */
/* stdio transport — a local child process                                     */
/* -------------------------------------------------------------------------- */

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  /** Only names listed by the connection are ever forwarded; values come from the host. */
  env?: Record<string, string>;
  cwd?: string;
}

interface ChildLike {
  stdin: { write(chunk: string, callback: (error?: Error | null) => void): void } | null;
  stdout: { on(event: "data", listener: (chunk: unknown) => void): void } | null;
  stderr: { on(event: "data", listener: (chunk: unknown) => void): void } | null;
  on(event: "error" | "exit", listener: (...args: never[]) => void): void;
  kill(signal?: string): boolean;
}

/** Characters that would let a command string turn into a shell pipeline. */
const SHELL_METACHARACTERS = /[;&|`$(){}<>\n\r]/;

export function assertSafeCommand(command: string): void {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    throw NexusError.validation(
      "missingCommand",
      "This connection has no program to run.",
      "Enter the command that starts the tool server, for example: npx -y @modelcontextprotocol/server-filesystem",
    );
  }
  if (SHELL_METACHARACTERS.test(trimmed)) {
    throw NexusError.security(
      "unsafeCommand",
      "That command contains shell characters, which Nexus OS will not run.",
      "Enter the program name on its own and put each option in the arguments list instead.",
    );
  }
}

/**
 * Runs a local MCP server as a child process and speaks newline-delimited
 * JSON-RPC to it. `child_process` is imported lazily so this module stays safe to
 * include in a browser bundle.
 */
export class StdioTransport implements McpTransport {
  readonly kind = "stdio" as const;
  readonly describe: string;

  private child: ChildLike | null = null;
  private events: McpTransportEvents | null = null;
  private buffer = "";
  /** The most recent stderr text, kept for the connection log. Redacted at the sink. */
  private diagnostics: string[] = [];

  constructor(private readonly options: StdioTransportOptions) {
    assertSafeCommand(options.command);
    this.describe = [options.command, ...(options.args ?? [])].join(" ");
  }

  async start(events: McpTransportEvents): Promise<void> {
    this.events = events;
    const { spawn } = (await import("node:child_process")) as unknown as {
      spawn: (command: string, args: string[], options: Record<string, unknown>) => ChildLike;
    };
    let child: ChildLike;
    try {
      child = spawn(this.options.command, this.options.args ?? [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...this.options.env },
        ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
      });
    } catch (error) {
      throw transportFailure(
        "cannotStartServer",
        `Nexus OS could not start “${this.options.command}”.`,
        "Check the command is installed and spelled correctly, then try connecting again.",
        error instanceof Error ? error.message : String(error),
      );
    }
    this.child = child;

    child.stdout?.on("data", (chunk: unknown) => this.ingest(String(chunk)));
    child.stderr?.on("data", (chunk: unknown) => {
      const text = String(chunk).trim();
      if (text.length === 0) return;
      this.diagnostics.push(text);
      if (this.diagnostics.length > 50) this.diagnostics.shift();
    });
    child.on("error", ((error: Error) => {
      events.failed(
        transportFailure(
          "serverProcessFailed",
          `“${this.options.command}” stopped working.`,
          "Check the program is installed, then choose Reconnect on this connection.",
          error.message,
        ),
      );
    }) as never);
    child.on("exit", ((code: number | null) => {
      this.child = null;
      events.closed(code === 0 ? "the tool server exited" : `the tool server exited with code ${code ?? -1}`);
    }) as never);
  }

  private ingest(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      const message = decodeMessage(line);
      if (message) this.events?.message(message);
      newline = this.buffer.indexOf("\n");
    }
    // A server that never sends a newline must not grow the buffer without bound.
    if (this.buffer.length > 1_000_000) this.buffer = "";
  }

  async send(message: JsonRpcOutbound): Promise<void> {
    const stdin = this.child?.stdin;
    if (!stdin) {
      throw transportFailure(
        "transportClosed",
        "That tool server is not running.",
        "Open Settings › MCP and choose Reconnect.",
      );
    }
    await new Promise<void>((resolve, reject) => {
      stdin.write(`${encodeMessage(message)}\n`, (error) => {
        if (error) {
          reject(
            transportFailure(
              "writeFailed",
              "Nexus OS could not send that request to the tool server.",
              "Choose Reconnect on this connection, then try again.",
              error.message,
            ),
          );
          return;
        }
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child) return;
    child.kill("SIGTERM");
  }

  /** Whatever the program wrote to stderr, newest last. Redacted before display. */
  get diagnosticLines(): string[] {
    return [...this.diagnostics];
  }
}

/* -------------------------------------------------------------------------- */
/* HTTP / SSE transport — a remote server                                      */
/* -------------------------------------------------------------------------- */

export interface HttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
  /** Self-hosted servers on the LAN are allowed only when the user said so. */
  allowLocalNetwork?: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * Streamable HTTP. Each request is POSTed; the reply is either a single JSON
 * document or an SSE stream, which is what the current MCP HTTP binding permits.
 * The URL passes through the same validator as every other outbound address, so
 * a server cannot be pointed at the cloud metadata service.
 */
export class HttpTransport implements McpTransport {
  readonly kind = "http" as const;
  readonly describe: string;

  private events: McpTransportEvents | null = null;
  private open = false;
  private readonly endpoint: URL;
  private readonly doFetch: typeof fetch;
  private sessionId: string | null = null;

  constructor(private readonly options: HttpTransportOptions) {
    this.endpoint = options.allowLocalNetwork
      ? validateLocalService(options.url)
      : validateFetchTarget(options.url);
    this.describe = `${this.endpoint.origin}${this.endpoint.pathname}`;
    this.doFetch = options.fetchImpl ?? globalThis.fetch;
  }

  async start(events: McpTransportEvents): Promise<void> {
    this.events = events;
    this.open = true;
  }

  async send(message: JsonRpcOutbound): Promise<void> {
    if (!this.open) {
      throw transportFailure(
        "transportClosed",
        "That tool server is no longer connected.",
        "Open Settings › MCP and choose Reconnect.",
      );
    }

    let response: Response;
    try {
      response = await this.doFetch(this.endpoint.toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
          ...this.options.headers,
        },
        body: encodeMessage(message),
      });
    } catch (error) {
      throw transportFailure(
        "cannotReachServer",
        `Nexus OS could not reach ${this.describe}.`,
        "Check the address and your internet connection, then try again.",
        error instanceof Error ? error.message : String(error),
      );
    }

    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;

    if (response.status === 202 || response.status === 204) return;
    if (!response.ok) {
      throw transportFailure(
        "serverRefused",
        `${this.describe} refused the request (${response.status}).`,
        response.status === 401 || response.status === 403
          ? "Check the access token saved for this connection in Settings › MCP."
          : "Try again in a moment. If it keeps failing, check the server is running.",
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      await this.readEventStream(response);
      return;
    }
    const decoded = decodeMessage(await response.text());
    if (decoded) this.events?.message(decoded);
  }

  private async readEventStream(response: Response): Promise<void> {
    const body = response.body;
    if (!body) return;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const decoded = decodeMessage(line.slice(5));
          if (decoded) this.events?.message(decoded);
        }
        separator = buffer.indexOf("\n\n");
      }
    }
  }

  async close(): Promise<void> {
    if (!this.open) return;
    this.open = false;
    this.events?.closed("closed by Nexus OS");
  }
}
