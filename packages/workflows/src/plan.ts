import { type ActionImpact, type ContentOrigin, grantsAuthority, impactLabel } from "@nexus/security";
import {
  type WorkflowGraph,
  effectiveImpact,
  executionOrder,
  findNode,
  graphImpact,
  incomingEdges,
} from "./graph.js";
import { type Requirement, nodeDefinition, requirementLabel } from "./nodes.js";
import { type ValidationContext, type ValidationIssue, validateWorkflow } from "./validate.js";

/**
 * The dry-run planner.
 *
 * It reports what a run *would* do, in the order it would do it, and it performs
 * no side effect of any kind — it never touches the runtime, so there is nothing
 * it could accidentally trigger. This is the screen a person reads before turning
 * a workflow on for the first time.
 */

export interface PlannedStep {
  order: number;
  nodeId: string;
  kind: string;
  title: string;
  label: string;
  /** Reads as a sentence after "It would…". */
  wouldDo: string;
  impact: ActionImpact;
  impactLabel: string;
  /** True when the step reaches outside Nexus OS. */
  sideEffect: boolean;
  requiresApproval: boolean;
  approvalReason: string | null;
  requires: Requirement[];
  /** Where this step's values come from, for the "inputs" column. */
  inputSources: Array<{ port: string; from: string; fromPort: string }>;
}

export interface WorkflowPlan {
  name: string;
  valid: boolean;
  issues: ValidationIssue[];
  steps: PlannedStep[];
  impact: ActionImpact;
  approvalsNeeded: number;
  sideEffectCount: number;
  requirements: Requirement[];
  /** Named external destinations the run would contact. */
  externalTargets: string[];
  /** One paragraph a beginner can read. */
  summary: string;
}

export interface PlanContext extends ValidationContext {
  name?: string;
  /** Who would be starting this run. A schedule is not a person. */
  origin?: ContentOrigin;
}

function approvalReasonFor(
  impact: ActionImpact,
  alwaysApproves: boolean,
  origin: ContentOrigin,
): string | null {
  if (alwaysApproves) return "This step always asks you before it does anything.";
  if (impact === "destructive") {
    return "This step permanently removes or sends something, so it asks even in a trusted workspace.";
  }
  if (impact === "system" && !grantsAuthority(origin)) {
    return "This step changes your Mac or an account, and this run was not started by you, so it asks.";
  }
  return null;
}

function externalTargetFor(kind: string, settings: Record<string, unknown>): string | null {
  const value = (key: string): string => {
    const raw = settings[key];
    return typeof raw === "string" ? raw.trim() : "";
  };
  switch (kind) {
    case "action.httpRequest":
      return value("url") || "an address you have not set yet";
    case "action.openUrl":
      return value("url") || "an address you have not set yet";
    case "action.mcpToolCall":
      return `${value("serverId") || "(no server)"} → ${value("tool") || "(no tool)"}`;
    case "action.aiPrompt":
      return value("provider") || "an AI provider you have not set yet";
    case "action.writeApprovedFile":
      return value("path") || "a file you have not chosen yet";
    default:
      return null;
  }
}

export function planWorkflow(graph: WorkflowGraph, context: PlanContext = {}): WorkflowPlan {
  const origin = context.origin ?? "user";
  const validation = validateWorkflow(graph, context);
  const order = executionOrder(graph);

  const steps: PlannedStep[] = [];
  const requirements = new Set<Requirement>();
  const externalTargets: string[] = [];

  order.forEach((nodeId, index) => {
    const node = findNode(graph, nodeId);
    if (!node) return;
    const definition = nodeDefinition(node.kind);
    const impact = effectiveImpact(node);
    const label = node.label || definition?.title || node.kind;
    const approvalReason = approvalReasonFor(impact, definition?.alwaysApproves ?? false, origin);
    for (const requirement of definition?.requires ?? []) requirements.add(requirement);
    const target = externalTargetFor(node.kind, node.settings);
    if (target && !externalTargets.includes(target)) externalTargets.push(target);

    steps.push({
      order: index + 1,
      nodeId,
      kind: node.kind,
      title: definition?.title ?? node.kind,
      label,
      wouldDo: definition
        ? definition.describe(node.settings, label)
        : "do something this version of Nexus OS does not understand",
      impact,
      impactLabel: impactLabel(impact),
      sideEffect: definition ? !definition.pure : true,
      requiresApproval: approvalReason !== null,
      approvalReason,
      requires: [...(definition?.requires ?? [])],
      inputSources: incomingEdges(graph, nodeId).map((edge) => ({
        port: edge.toPort,
        from: findNode(graph, edge.from)?.label || edge.from,
        fromPort: edge.fromPort,
      })),
    });
  });

  const approvalsNeeded = steps.filter((step) => step.requiresApproval).length;
  const sideEffectCount = steps.filter((step) => step.sideEffect).length;

  const sentences: string[] = [];
  sentences.push(
    steps.length === 0
      ? "This workflow has no steps, so a run would do nothing."
      : `A run would carry out ${steps.length} step${steps.length === 1 ? "" : "s"}.`,
  );
  if (sideEffectCount === 0 && steps.length > 0) {
    sentences.push("Nothing outside Nexus OS would be changed.");
  } else if (sideEffectCount > 0) {
    sentences.push(
      `${sideEffectCount} of them reach${sideEffectCount === 1 ? "es" : ""} outside Nexus OS.`,
    );
  }
  sentences.push(
    approvalsNeeded === 0
      ? "Nothing would stop to ask you."
      : `${approvalsNeeded} step${approvalsNeeded === 1 ? "" : "s"} would stop and ask you first.`,
  );
  if (requirements.size > 0) {
    sentences.push(`It uses ${[...requirements].map(requirementLabel).join(", ")}.`);
  }
  if (!validation.valid) {
    sentences.push(
      `It cannot run yet — ${validation.errors.length} problem${validation.errors.length === 1 ? "" : "s"} to fix first.`,
    );
  }

  return {
    name: context.name ?? "Workflow",
    valid: validation.valid,
    issues: validation.issues,
    steps,
    impact: graphImpact(graph),
    approvalsNeeded,
    sideEffectCount,
    requirements: [...requirements],
    externalTargets,
    summary: sentences.join(" "),
  };
}
