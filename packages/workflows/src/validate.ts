import { NexusError } from "@nexus/security";
import {
  type WorkflowGraph,
  findCycle,
  incomingEdges,
  reachableNodes,
  triggerNodes,
} from "./graph.js";
import {
  type Requirement,
  inputPort,
  nodeDefinition,
  outputPort,
  portsCompatible,
  requirementFixHref,
  requirementLabel,
} from "./nodes.js";

/**
 * Validation.
 *
 * Nothing here is advisory. `assertRunnable` is called by the executor before the
 * first step and by the API route before `enabled` can be set to true, so an
 * invalid workflow cannot be turned on and cannot be run — the two doors are the
 * same door.
 */

export type IssueCode =
  | "unknownNodeType"
  | "duplicateNodeId"
  | "danglingEdge"
  | "unknownPort"
  | "portTypeMismatch"
  | "cycleDetected"
  | "unboundRequiredInput"
  | "missingSetting"
  | "unreachableNode"
  | "missingCredential"
  | "noTrigger";

export interface ValidationIssue {
  code: IssueCode;
  severity: "error" | "warning";
  /** The node the builder should highlight, when there is one. */
  nodeId: string | null;
  /** The index into `graph.edges`, when the problem is an edge. */
  edgeIndex: number | null;
  portId: string | null;
  message: string;
  /** The concrete next step. Never empty. */
  recovery: string;
  /** A link straight to the screen that fixes it, when one exists. */
  fixHref: string | null;
}

export interface ValidationContext {
  /** Which credentials and capabilities are actually available right now. */
  available?: Iterable<Requirement>;
  /** Tool ids (`serverId:tool`) that exist and are enabled, for MCP steps. */
  availableTools?: Iterable<string>;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function issue(
  code: IssueCode,
  message: string,
  recovery: string,
  extra: Partial<Pick<ValidationIssue, "nodeId" | "edgeIndex" | "portId" | "severity" | "fixHref">> = {},
): ValidationIssue {
  return {
    code,
    severity: extra.severity ?? "error",
    nodeId: extra.nodeId ?? null,
    edgeIndex: extra.edgeIndex ?? null,
    portId: extra.portId ?? null,
    message,
    recovery,
    fixHref: extra.fixHref ?? null,
  };
}

export function validateWorkflow(graph: WorkflowGraph, context: ValidationContext = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const available = new Set(context.available ?? []);
  const availableTools = new Set(context.availableTools ?? []);
  const known = new Set<string>();

  /* --- nodes ----------------------------------------------------------- */
  for (const node of graph.nodes) {
    const name = node.label || node.kind;
    if (known.has(node.id)) {
      issues.push(
        issue(
          "duplicateNodeId",
          `Two steps share the identifier “${node.id}”.`,
          "Delete one of them and add it again, which gives it a fresh identifier.",
          { nodeId: node.id },
        ),
      );
    }
    known.add(node.id);

    const definition = nodeDefinition(node.kind);
    if (!definition) {
      issues.push(
        issue(
          "unknownNodeType",
          `“${name}” is a kind of step this version of Nexus OS does not have.`,
          "Delete the step, or update Nexus OS if this workflow came from a newer version.",
          { nodeId: node.id },
        ),
      );
      continue;
    }

    for (const setting of definition.settings) {
      if (!setting.required) continue;
      const value = node.settings[setting.key];
      const filled =
        typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
      if (!filled) {
        issues.push(
          issue(
            "missingSetting",
            `“${name}” needs ${setting.label.toLowerCase()} before it can run.`,
            `Select the step and fill in ${setting.label}.`,
            { nodeId: node.id, portId: setting.key },
          ),
        );
      }
    }

    for (const requirement of definition.requires) {
      if (available.size > 0 && available.has(requirement)) continue;
      if (available.size === 0) {
        // Nothing was declared available, so credentials cannot be checked at all.
        issues.push(
          issue(
            "missingCredential",
            `“${name}” needs ${requirementLabel(requirement)}, and Nexus OS could not confirm it is connected.`,
            `Open the connection screen and check ${requirementLabel(requirement)} is set up.`,
            { nodeId: node.id, severity: "warning", fixHref: requirementFixHref(requirement) },
          ),
        );
        continue;
      }
      issues.push(
        issue(
          "missingCredential",
          `“${name}” needs ${requirementLabel(requirement)}, which is not connected.`,
          `Connect it, then come back and run this workflow.`,
          { nodeId: node.id, fixHref: requirementFixHref(requirement) },
        ),
      );
    }

    if (node.kind === "action.mcpToolCall" && availableTools.size > 0) {
      const id = `${String(node.settings["serverId"] ?? "")}:${String(node.settings["tool"] ?? "")}`;
      if (!availableTools.has(id)) {
        issues.push(
          issue(
            "missingCredential",
            `“${name}” uses a tool that is not available: ${id}.`,
            "Open the MCP centre, discover tools on that connection and switch the tool on.",
            { nodeId: node.id, fixHref: "/mcp" },
          ),
        );
      }
    }

    for (const port of definition.inputs) {
      if (!port.required) continue;
      const bound = incomingEdges(graph, node.id).some((edge) => edge.toPort === port.id);
      const literal = node.inputs[port.id];
      const hasLiteral = literal !== undefined && literal !== null && literal !== "";
      if (!bound && !hasLiteral) {
        issues.push(
          issue(
            "unboundRequiredInput",
            `“${name}” has nothing connected to its ${port.label.toLowerCase()} input.`,
            port.id === "run"
              ? "Draw a line from the step that should come before it."
              : `Connect a value to ${port.label}, or type one in on the step.`,
            { nodeId: node.id, portId: port.id },
          ),
        );
      }
    }
  }

  /* --- edges ----------------------------------------------------------- */
  graph.edges.forEach((edge, index) => {
    const source = graph.nodes.find((node) => node.id === edge.from);
    const target = graph.nodes.find((node) => node.id === edge.to);
    if (!source || !target) {
      issues.push(
        issue(
          "danglingEdge",
          "A connection points at a step that no longer exists.",
          "Delete the connection, then draw it again between two steps that are on the canvas.",
          { edgeIndex: index },
        ),
      );
      return;
    }
    const from = outputPort(source.kind, edge.fromPort);
    const to = inputPort(target.kind, edge.toPort);
    if (!from || !to) {
      issues.push(
        issue(
          "unknownPort",
          `A connection uses a socket that “${(from ? target : source).label || (from ? target : source).kind}” does not have.`,
          "Delete the connection and draw it again between two sockets that exist.",
          { edgeIndex: index, nodeId: from ? target.id : source.id, portId: from ? edge.toPort : edge.fromPort },
        ),
      );
      return;
    }
    if (!portsCompatible(from.type, to.type)) {
      issues.push(
        issue(
          "portTypeMismatch",
          `“${from.label}” produces ${from.type}, which does not fit into “${to.label}” (${to.type}).`,
          "Add a Transform data step between them, or connect a socket of a matching kind.",
          { edgeIndex: index, nodeId: target.id, portId: to.id },
        ),
      );
    }
  });

  /* --- shape ----------------------------------------------------------- */
  const triggers = triggerNodes(graph);
  if (graph.nodes.length > 0 && triggers.length === 0) {
    issues.push(
      issue(
        "noTrigger",
        "This workflow has no starting point.",
        "Add a trigger such as Manual button or On a schedule, and connect it to the first step.",
      ),
    );
  }

  const cycle = findCycle(graph);
  if (cycle && cycle.length > 0) {
    const names = cycle
      .map((id) => graph.nodes.find((node) => node.id === id))
      .map((node) => node?.label || node?.kind || "a step")
      .join(" → ");
    issues.push(
      issue(
        "cycleDetected",
        `These steps run in a loop that never ends: ${names}.`,
        "Delete one of the connections in that loop so the workflow can finish.",
        { nodeId: cycle[0] ?? null },
      ),
    );
  }

  if (!cycle && triggers.length > 0) {
    const reachable = reachableNodes(graph);
    for (const node of graph.nodes) {
      if (reachable.has(node.id)) continue;
      issues.push(
        issue(
          "unreachableNode",
          `“${node.label || node.kind}” is never reached, so it would never run.`,
          "Connect it to the rest of the workflow, or delete it.",
          { nodeId: node.id },
        ),
      );
    }
  }

  const errors = issues.filter((entry) => entry.severity === "error");
  const warnings = issues.filter((entry) => entry.severity === "warning");
  return { valid: errors.length === 0, issues, errors, warnings };
}

/**
 * The single gate. Both "enable this workflow" and "run this workflow" pass
 * through here, so the two can never disagree about what valid means.
 */
export function assertRunnable(graph: WorkflowGraph, context: ValidationContext = {}): ValidationResult {
  const result = validateWorkflow(graph, context);
  if (result.valid) return result;
  const first = result.errors[0];
  throw new NexusError(
    "workflow",
    "workflowInvalid",
    first
      ? `This workflow cannot run yet: ${first.message}`
      : "This workflow cannot run yet.",
    first?.recovery ?? "Open the workflow and fix the problems marked on the canvas.",
    { problems: String(result.errors.length) },
  );
}

export function canEnable(graph: WorkflowGraph, context: ValidationContext = {}): boolean {
  return validateWorkflow(graph, context).valid;
}
