import { NexusError } from "@nexus/security";

/**
 * JSON-RPC 2.0 and the Model Context Protocol envelope.
 *
 * This module is pure data: it knows how to build a request, how to read a reply
 * and how to turn a protocol-level failure into a `NexusError` that carries a
 * plain-language message and a next step. It performs no I/O, so it is safe to
 * import from a browser bundle as well as from a route handler.
 */

export const JSONRPC_VERSION = "2.0";

/** The MCP revision Nexus OS negotiates. Servers may answer with an older one. */
export const MCP_PROTOCOL_VERSION = "2024-11-05";

export const NEXUS_CLIENT_INFO = { name: "Nexus OS", version: "0.1.0" } as const;

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId | null;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

export type JsonRpcOutbound = JsonRpcRequest | JsonRpcNotification;
export type JsonRpcInbound = JsonRpcResponse | JsonRpcNotification;

export function request(id: JsonRpcId, method: string, params?: Record<string, unknown>): JsonRpcRequest {
  return params === undefined
    ? { jsonrpc: JSONRPC_VERSION, id, method }
    : { jsonrpc: JSONRPC_VERSION, id, method, params };
}

export function notification(method: string, params?: Record<string, unknown>): JsonRpcNotification {
  return params === undefined
    ? { jsonrpc: JSONRPC_VERSION, method }
    : { jsonrpc: JSONRPC_VERSION, method, params };
}

export function isRequest(message: JsonRpcOutbound): message is JsonRpcRequest {
  return "id" in message;
}

export function isResponse(message: JsonRpcInbound): message is JsonRpcResponse {
  return "id" in message && !("method" in message);
}

export function isNotification(message: JsonRpcInbound): message is JsonRpcNotification {
  return "method" in message && !("id" in message);
}

/**
 * Reads one line or one SSE `data:` payload. A server that emits noise on its
 * output stream is a real and common failure, so the caller gets `null` for
 * anything that is not a JSON-RPC message rather than an exception.
 */
export function decodeMessage(text: string): JsonRpcInbound | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) return null;
  const candidate = decoded as Record<string, unknown>;
  if (candidate["jsonrpc"] !== JSONRPC_VERSION) return null;
  if (typeof candidate["method"] === "string" && candidate["id"] === undefined) {
    return {
      jsonrpc: JSONRPC_VERSION,
      method: candidate["method"],
      ...(candidate["params"] && typeof candidate["params"] === "object"
        ? { params: candidate["params"] as Record<string, unknown> }
        : {}),
    };
  }
  if (candidate["id"] === undefined) return null;
  const id = candidate["id"];
  if (id !== null && typeof id !== "string" && typeof id !== "number") return null;
  const response: JsonRpcResponse = { jsonrpc: JSONRPC_VERSION, id };
  if ("result" in candidate) response.result = candidate["result"];
  if (candidate["error"] && typeof candidate["error"] === "object") {
    const raw = candidate["error"] as Record<string, unknown>;
    response.error = {
      code: typeof raw["code"] === "number" ? raw["code"] : -32603,
      message: typeof raw["message"] === "string" ? raw["message"] : "The server reported an error.",
      ...("data" in raw ? { data: raw["data"] } : {}),
    };
  }
  return response;
}

export function encodeMessage(message: JsonRpcOutbound): string {
  return JSON.stringify(message);
}

/** JSON-RPC reserved codes, explained the way a person would want to read them. */
const RESERVED_CODES: ReadonlyMap<number, { message: string; recovery: string }> = new Map([
  [
    -32700,
    {
      message: "The tool server sent something Nexus OS could not read.",
      recovery: "Update the tool server to its newest version, then try connecting again.",
    },
  ],
  [
    -32600,
    {
      message: "The tool server rejected the request as malformed.",
      recovery: "Update the tool server, then try again. Report this if it keeps happening.",
    },
  ],
  [
    -32601,
    {
      message: "The tool server does not offer that action.",
      recovery: "Re-run Discover tools on this connection so Nexus OS learns what it can do now.",
    },
  ],
  [
    -32602,
    {
      message: "The tool server refused the values supplied for that action.",
      recovery: "Check the values you entered against the tool's description, then try again.",
    },
  ],
  [
    -32603,
    {
      message: "The tool server hit an internal error.",
      recovery: "Try again in a moment. If it keeps failing, check the tool server's own logs.",
    },
  ],
]);

/** Turns a JSON-RPC error object into the one error type the interface renders. */
export function errorFromRpc(error: JsonRpcErrorObject, serverName: string): NexusError {
  const reserved = RESERVED_CODES.get(error.code);
  if (reserved) {
    return new NexusError("integration", `rpc${error.code}`, reserved.message, reserved.recovery, {
      server: serverName,
      detail: error.message,
    });
  }
  return new NexusError(
    "integration",
    "toolServerError",
    `“${serverName}” could not complete that request.`,
    "Try again. If it keeps happening, open the connection's log to see what the server reported.",
    { detail: error.message, code: String(error.code) },
  );
}

/* -------------------------------------------------------------------------- */
/* MCP payload shapes                                                          */
/* -------------------------------------------------------------------------- */

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpInitializeResult {
  protocolVersion: string;
  serverInfo: McpServerInfo;
  capabilities: Record<string, unknown>;
  instructions: string;
}

/**
 * Server-declared behaviour hints. Nexus OS reads them, but never trusts them to
 * make something *less* dangerous than the name suggests — see `classify.ts`.
 */
export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: McpToolAnnotations;
}

export interface McpToolListPage {
  tools: McpToolDefinition[];
  nextCursor: string | null;
}

export interface McpContentBlock {
  type: string;
  text: string;
  /** Non-text blocks keep their raw payload so nothing is silently discarded. */
  raw: unknown;
}

export interface McpToolResult {
  content: McpContentBlock[];
  isError: boolean;
  structured: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function parseInitializeResult(value: unknown): McpInitializeResult {
  const record = asRecord(value);
  const info = asRecord(record["serverInfo"]);
  return {
    protocolVersion: asString(record["protocolVersion"], MCP_PROTOCOL_VERSION),
    serverInfo: {
      name: asString(info["name"], "Tool server"),
      version: asString(info["version"], "unknown"),
    },
    capabilities: asRecord(record["capabilities"]),
    instructions: asString(record["instructions"]),
  };
}

export function parseToolListPage(value: unknown): McpToolListPage {
  const record = asRecord(value);
  const rawTools = Array.isArray(record["tools"]) ? record["tools"] : [];
  const tools: McpToolDefinition[] = [];
  for (const entry of rawTools) {
    const tool = asRecord(entry);
    const name = asString(tool["name"]);
    if (name.length === 0) continue;
    const annotations = asRecord(tool["annotations"]);
    const parsed: McpToolDefinition = {
      name,
      description: asString(tool["description"]),
      inputSchema: asRecord(tool["inputSchema"]),
      annotations: {
        ...(typeof annotations["title"] === "string" ? { title: annotations["title"] } : {}),
        ...(typeof annotations["readOnlyHint"] === "boolean"
          ? { readOnlyHint: annotations["readOnlyHint"] }
          : {}),
        ...(typeof annotations["destructiveHint"] === "boolean"
          ? { destructiveHint: annotations["destructiveHint"] }
          : {}),
        ...(typeof annotations["idempotentHint"] === "boolean"
          ? { idempotentHint: annotations["idempotentHint"] }
          : {}),
        ...(typeof annotations["openWorldHint"] === "boolean"
          ? { openWorldHint: annotations["openWorldHint"] }
          : {}),
      },
    };
    tools.push(parsed);
  }
  const cursor = record["nextCursor"];
  return { tools, nextCursor: typeof cursor === "string" && cursor.length > 0 ? cursor : null };
}

export function parseToolResult(value: unknown): McpToolResult {
  const record = asRecord(value);
  const rawContent = Array.isArray(record["content"]) ? record["content"] : [];
  const content: McpContentBlock[] = rawContent.map((entry) => {
    const block = asRecord(entry);
    return {
      type: asString(block["type"], "unknown"),
      text: asString(block["text"]),
      raw: entry,
    };
  });
  return {
    content,
    isError: record["isError"] === true,
    structured: "structuredContent" in record ? record["structuredContent"] : null,
  };
}

/** Flattens a result to the text a person (or a log line) would read. */
export function toolResultText(result: McpToolResult): string {
  const parts = result.content
    .map((block) => (block.text.length > 0 ? block.text : `[${block.type}]`))
    .filter((part) => part.length > 0);
  if (parts.length > 0) return parts.join("\n");
  if (result.structured !== null && result.structured !== undefined) {
    return JSON.stringify(result.structured);
  }
  return "";
}
