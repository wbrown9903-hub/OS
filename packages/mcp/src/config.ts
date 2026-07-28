import {
  type PermissionMode,
  type PermissionPolicy,
  type ToolDescriptor,
  NexusError,
  makePermissionPolicy,
} from "@nexus/security";
import { McpClient, type McpClientOptions } from "./client.js";
import {
  HttpTransport,
  type McpTransport,
  StdioTransport,
} from "./transport.js";

/**
 * The stored shape of one connection, and the two derivations everything else
 * depends on: the permission policy it produces, and the transport it opens.
 *
 * Keeping both here means the API route, the workflow engine and the test console
 * cannot disagree about what "this server, with these tools disabled" means.
 */

export type McpTransportName = "stdio" | "http";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransportName;
  /** stdio only: the program to run. */
  command: string;
  args: string[];
  /** stdio only: names of environment variables to forward. Values never stored. */
  envKeys: string[];
  /** http only: the endpoint. */
  url: string;
  permissionMode: PermissionMode;
  /** Tool names ticked under "Allow Selected Actions". */
  allowedTools: string[];
  /** Tool names explicitly turned off. Wins in every mode. */
  deniedTools: string[];
  confirmDestructive: boolean;
  timeoutMs: number;
  maxRetries: number;
  allowLocalNetwork?: boolean;
}

export function toolId(serverId: string, toolName: string): string {
  return `${serverId}:${toolName}`;
}

/**
 * Builds the policy the permission engine evaluates.
 *
 * A tool the user has switched off — either explicitly denied, or simply not
 * enabled after discovery — lands in the deny list, which wins in every mode
 * including Trusted Workspace.
 */
export function policyFor(
  config: McpServerConfig,
  tools: ReadonlyArray<{ name: string; enabled: boolean }> = [],
): PermissionPolicy {
  const denied = new Set(config.deniedTools.map((name) => toolId(config.id, name)));
  for (const tool of tools) {
    if (!tool.enabled) denied.add(toolId(config.id, tool.name));
  }
  return makePermissionPolicy({
    mode: config.permissionMode,
    allowedToolIds: config.allowedTools.map((name) => toolId(config.id, name)),
    deniedToolIds: denied,
    confirmDestructiveActions: config.confirmDestructive,
  });
}

export interface TransportFactoryOptions {
  /** Resolved values for `envKeys`. The caller reads them; this module never does. */
  env?: Record<string, string>;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export function createTransport(config: McpServerConfig, options: TransportFactoryOptions = {}): McpTransport {
  if (config.transport === "stdio") {
    return new StdioTransport({
      command: config.command,
      args: config.args,
      env: options.env ?? {},
    });
  }
  if (config.url.trim().length === 0) {
    throw NexusError.validation(
      "missingUrl",
      "This connection has no web address.",
      "Enter the address the tool server listens on, for example https://tools.example.com/mcp",
    );
  }
  return new HttpTransport({
    url: config.url,
    ...(options.headers ? { headers: options.headers } : {}),
    ...(config.allowLocalNetwork ? { allowLocalNetwork: true } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}

export function createClient(
  config: McpServerConfig,
  options: TransportFactoryOptions & Partial<Pick<McpClientOptions, "log" | "clock" | "sleep">> = {},
): McpClient {
  return new McpClient({
    serverId: config.id,
    serverName: config.name,
    transport: createTransport(config, options),
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    ...(options.log ? { log: options.log } : {}),
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
  });
}

/** The descriptor list the pipeline needs, built from stored rows. */
export function descriptorsFor(
  serverId: string,
  tools: ReadonlyArray<{ name: string; description: string; impact: string; dataAccess: string[] }>,
): ToolDescriptor[] {
  return tools.map((tool) => ({
    id: toolId(serverId, tool.name),
    name: tool.name,
    description: tool.description || "This tool server gave no description.",
    impact:
      tool.impact === "read" || tool.impact === "destructive" || tool.impact === "system"
        ? tool.impact
        : "write",
    dataAccess: tool.dataAccess,
  }));
}
