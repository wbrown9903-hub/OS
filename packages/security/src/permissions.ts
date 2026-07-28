import { NexusError } from "./errors.js";
import { type ContentOrigin, explainOrigin, grantsAuthority } from "./trust.js";

/**
 * The authority in Nexus OS. A model may *request* anything; only this decides.
 *
 * Port of apps/mac-bridge/Sources/SecurityCore/PermissionPolicy.swift. The decision
 * table is identical, including the two rules that keep Trusted Workspace bounded:
 * destructive work still confirms, and a system-impact action whose request did not
 * come from the user still confirms.
 */

export const ACTION_IMPACTS = ["read", "write", "destructive", "system"] as const;
export type ActionImpact = (typeof ACTION_IMPACTS)[number];

const IMPACT_RANK: Record<ActionImpact, number> = {
  read: 0,
  write: 1,
  system: 2,
  destructive: 3,
};

export function compareImpact(a: ActionImpact, b: ActionImpact): number {
  return IMPACT_RANK[a] - IMPACT_RANK[b];
}

export function impactLabel(impact: ActionImpact): string {
  switch (impact) {
    case "read":
      return "Reads information";
    case "write":
      return "Creates or changes information";
    case "destructive":
      return "Permanently removes or sends something";
    case "system":
      return "Changes your Mac or an account";
  }
}

export const PERMISSION_MODES = [
  "disabled",
  "readOnly",
  "askEveryTime",
  "allowSelected",
  "trustedWorkspace",
] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export function permissionModeTitle(mode: PermissionMode): string {
  switch (mode) {
    case "disabled":
      return "Disabled";
    case "readOnly":
      return "Read Only";
    case "askEveryTime":
      return "Ask Every Time";
    case "allowSelected":
      return "Allow Selected Actions";
    case "trustedWorkspace":
      return "Trusted Workspace";
  }
}

export function permissionModeExplanation(mode: PermissionMode): string {
  switch (mode) {
    case "disabled":
      return "Nothing from this connection can run.";
    case "readOnly":
      return "It may look at information, but may not change anything.";
    case "askEveryTime":
      return "You are asked before every single action.";
    case "allowSelected":
      return "Only the actions you ticked can run without asking.";
    case "trustedWorkspace":
      return "Routine actions run without asking. Anything permanent still asks.";
  }
}

export interface ToolDescriptor {
  id: string;
  name: string;
  description: string;
  impact: ActionImpact;
  /** Human-readable summary of what data the tool can reach. */
  dataAccess?: string[];
}

export interface PermissionPolicy {
  mode: PermissionMode;
  /** Tool identifiers explicitly ticked by the user under `allowSelected`. */
  allowedToolIds: ReadonlySet<string>;
  /** Tool identifiers the user has explicitly forbidden. Always wins. */
  deniedToolIds: ReadonlySet<string>;
  /** Even in Trusted Workspace, destructive work asks unless deliberately turned off. */
  confirmDestructiveActions: boolean;
}

export function makePermissionPolicy(
  overrides: Partial<{
    mode: PermissionMode;
    allowedToolIds: Iterable<string>;
    deniedToolIds: Iterable<string>;
    confirmDestructiveActions: boolean;
  }> = {},
): PermissionPolicy {
  return {
    mode: overrides.mode ?? "askEveryTime",
    allowedToolIds: new Set(overrides.allowedToolIds ?? []),
    deniedToolIds: new Set(overrides.deniedToolIds ?? []),
    confirmDestructiveActions: overrides.confirmDestructiveActions ?? true,
  };
}

/** The safe default for anything newly connected. */
export const SAFE_DEFAULT_POLICY: PermissionPolicy = makePermissionPolicy({ mode: "askEveryTime" });

export type PermissionDecision =
  | { kind: "allow"; reason: string }
  | { kind: "confirm"; prompt: string; impact: ActionImpact }
  | { kind: "deny"; error: NexusError };

export function requiresUserInteraction(decision: PermissionDecision): boolean {
  return decision.kind === "confirm";
}
export function isAllowedOutright(decision: PermissionDecision): boolean {
  return decision.kind === "allow";
}
export function isDenied(decision: PermissionDecision): boolean {
  return decision.kind === "deny";
}

export class PermissionEngine {
  evaluate(
    tool: ToolDescriptor,
    policy: PermissionPolicy,
    requestOrigin: ContentOrigin = "model",
  ): PermissionDecision {
    if (policy.deniedToolIds.has(tool.id)) {
      return {
        kind: "deny",
        error: NexusError.permission(
          "toolDenied",
          `“${tool.name}” is turned off for this connection.`,
          "Turn it back on in Settings › MCP › this connection › Tools, if you want it available.",
        ),
      };
    }

    switch (policy.mode) {
      case "disabled":
        return {
          kind: "deny",
          error: NexusError.permission(
            "connectionDisabled",
            `This connection is disabled, so “${tool.name}” cannot run.`,
            "Enable the connection in Settings › MCP to use it again.",
          ),
        };

      case "readOnly":
        if (tool.impact !== "read") {
          return {
            kind: "deny",
            error: NexusError.permission(
              "readOnlyMode",
              `“${tool.name}” would change something, and this connection is set to Read Only.`,
              "Switch the connection to “Ask Every Time” if you want to allow changes.",
            ),
          };
        }
        return { kind: "allow", reason: "Read Only permits information to be read." };

      case "askEveryTime":
        return {
          kind: "confirm",
          prompt: confirmationPrompt(tool, requestOrigin),
          impact: tool.impact,
        };

      case "allowSelected": {
        if (!policy.allowedToolIds.has(tool.id)) {
          return {
            kind: "confirm",
            prompt: confirmationPrompt(tool, requestOrigin),
            impact: tool.impact,
          };
        }
        if (tool.impact === "destructive" && policy.confirmDestructiveActions) {
          return {
            kind: "confirm",
            prompt: confirmationPrompt(tool, requestOrigin),
            impact: tool.impact,
          };
        }
        return { kind: "allow", reason: `You allowed “${tool.name}” for this connection.` };
      }

      case "trustedWorkspace": {
        // Trusted still means bounded: irreversible work is confirmed, and a
        // model-originated request never silently reaches a system-level tool.
        if (tool.impact === "destructive" && policy.confirmDestructiveActions) {
          return {
            kind: "confirm",
            prompt: confirmationPrompt(tool, requestOrigin),
            impact: tool.impact,
          };
        }
        if (tool.impact === "system" && !grantsAuthority(requestOrigin)) {
          return {
            kind: "confirm",
            prompt: confirmationPrompt(tool, requestOrigin),
            impact: tool.impact,
          };
        }
        return { kind: "allow", reason: "This is a trusted workspace and the action is reversible." };
      }
    }
  }
}

export function confirmationPrompt(tool: ToolDescriptor, requestOrigin: ContentOrigin): string {
  const lines = [`Allow “${tool.name}” to run?`, tool.description, impactLabel(tool.impact)];
  if (tool.dataAccess && tool.dataAccess.length > 0) {
    lines.push(`It can reach: ${tool.dataAccess.join(", ")}.`);
  }
  if (!grantsAuthority(requestOrigin)) {
    lines.push(`Requested by: ${explainOrigin(requestOrigin)}`);
  }
  return lines.join("\n");
}

export const permissionEngine = new PermissionEngine();

/* -------------------------------------------------------------------------- */
/* Audit                                                                       */
/* -------------------------------------------------------------------------- */

export const AUDIT_OUTCOMES = [
  "allowed",
  "denied",
  "confirmed",
  "cancelled",
  "failed",
  "completed",
] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/** Maps a decision to the outcome recorded before anything actually runs. */
export function outcomeForDecision(decision: PermissionDecision): AuditOutcome {
  switch (decision.kind) {
    case "allow":
      return "allowed";
    case "confirm":
      return "confirmed";
    case "deny":
      return "denied";
  }
}
