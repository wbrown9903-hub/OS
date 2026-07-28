import { z } from "zod";
import { type ActionImpact, NexusError } from "@nexus/security";
import { nodeDefinition } from "./nodes.js";

/**
 * The stored workflow graph.
 *
 * The field names deliberately match the structural contract in
 * `packages/database/src/columns.ts` (`nodes[].id/kind/label/settings/impact`,
 * `edges[].from/to/when`), so a graph written here round-trips through that
 * helper unchanged. The extra fields — port names on an edge, canvas position and
 * a retry count on a node — are additive, and a reader that does not know about
 * them simply ignores them.
 */

export const portValueSchema: z.ZodType<unknown> = z.unknown();

export const workflowNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().default(""),
  settings: z.record(z.string(), z.unknown()).default({}),
  impact: z.enum(["read", "write", "destructive", "system"]).default("read"),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  /** How many extra attempts a failing step gets before the run stops. */
  retries: z.number().int().min(0).max(5).default(0),
  /** Literal values for input ports with no incoming edge. */
  inputs: z.record(z.string(), z.unknown()).default({}),
});
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  when: z.string().nullable().default(null),
  fromPort: z.string().default("done"),
  toPort: z.string().default("run"),
});
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const graphSchema = z.object({
  version: z.number().default(1),
  nodes: z.array(workflowNodeSchema).default([]),
  edges: z.array(workflowEdgeSchema).default([]),
  trigger: z
    .object({
      kind: z.enum(["manual", "schedule", "webhook", "event"]).default("manual"),
      value: z.string().default(""),
    })
    .default({ kind: "manual", value: "" }),
});
export type WorkflowGraph = z.infer<typeof graphSchema>;

export function emptyGraph(): WorkflowGraph {
  return graphSchema.parse({});
}

/**
 * Parses a stored graph. A workflow whose graph cannot be read must not be
 * silently replaced by an empty one, because that would make an enabled workflow
 * look fine while doing nothing.
 */
export function parseGraph(value: unknown, label = "workflow"): WorkflowGraph {
  const result = graphSchema.safeParse(value);
  if (!result.success) {
    throw new NexusError(
      "storage",
      "unreadableWorkflow",
      `The saved ${label} could not be read because its contents are not valid.`,
      "Open the workflow and rebuild the affected step, or restore a backup from Settings › Backup.",
      { reason: result.error.issues.map((issue) => issue.path.join(".") || "graph").join(", ") },
    );
  }
  return result.data;
}

export function parseGraphJSON(raw: string, label = "workflow"): WorkflowGraph {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new NexusError(
      "storage",
      "unreadableWorkflow",
      `The saved ${label} could not be read because its contents are not valid.`,
      "Open the workflow and rebuild the affected step, or restore a backup from Settings › Backup.",
    );
  }
  return parseGraph(decoded, label);
}

export function serialiseGraph(graph: WorkflowGraph): string {
  return JSON.stringify(graph);
}

/* -------------------------------------------------------------------------- */
/* Reading the graph                                                           */
/* -------------------------------------------------------------------------- */

export function findNode(graph: WorkflowGraph, nodeId: string): WorkflowNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function incomingEdges(graph: WorkflowGraph, nodeId: string): WorkflowEdge[] {
  return graph.edges.filter((edge) => edge.to === nodeId);
}

export function outgoingEdges(graph: WorkflowGraph, nodeId: string): WorkflowEdge[] {
  return graph.edges.filter((edge) => edge.from === nodeId);
}

export function triggerNodes(graph: WorkflowGraph): WorkflowNode[] {
  return graph.nodes.filter((node) => nodeDefinition(node.kind)?.category === "trigger");
}

/** The impact actually in force for a node, which may depend on its settings. */
export function effectiveImpact(node: WorkflowNode): ActionImpact {
  const definition = nodeDefinition(node.kind);
  if (!definition) return "write";
  return definition.impactFor ? definition.impactFor(node.settings) : definition.impact;
}

/** The most dangerous thing anywhere in the graph. Shown before a run. */
export function graphImpact(graph: WorkflowGraph): ActionImpact {
  const rank: Record<ActionImpact, number> = { read: 0, write: 1, system: 2, destructive: 3 };
  let highest: ActionImpact = "read";
  for (const node of graph.nodes) {
    const impact = effectiveImpact(node);
    if (rank[impact] > rank[highest]) highest = impact;
  }
  return highest;
}

/**
 * Depth-first order starting from the triggers, following `trigger`-typed ports.
 * Nodes that cannot be reached from a trigger are not returned — validation
 * reports them separately rather than the executor quietly running them.
 */
export function executionOrder(graph: WorkflowGraph): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  const walk = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    order.push(nodeId);
    for (const edge of outgoingEdges(graph, nodeId)) walk(edge.to);
  };
  for (const trigger of triggerNodes(graph)) walk(trigger.id);
  return order;
}

/** Every node reachable from any trigger, including via data-only edges. */
export function reachableNodes(graph: WorkflowGraph): Set<string> {
  return new Set(executionOrder(graph));
}

/**
 * Finds one cycle, if there is one, as the list of node ids that form it.
 * Returning the path rather than a boolean lets the builder highlight it.
 */
export function findCycle(graph: WorkflowGraph): string[] | null {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (nodeId: string): string[] | null => {
    const current = state.get(nodeId);
    if (current === "done") return null;
    if (current === "visiting") {
      const start = stack.indexOf(nodeId);
      return [...stack.slice(start === -1 ? 0 : start), nodeId];
    }
    state.set(nodeId, "visiting");
    stack.push(nodeId);
    for (const edge of outgoingEdges(graph, nodeId)) {
      const found = visit(edge.to);
      if (found) return found;
    }
    stack.pop();
    state.set(nodeId, "done");
    return null;
  };

  for (const node of graph.nodes) {
    const found = visit(node.id);
    if (found) return found;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Editing the graph                                                           */
/* -------------------------------------------------------------------------- */

export function addNode(
  graph: WorkflowGraph,
  node: { id: string; kind: string; label?: string; settings?: Record<string, unknown>; position?: { x: number; y: number } },
): WorkflowGraph {
  const definition = nodeDefinition(node.kind);
  const settings: Record<string, unknown> = { ...(node.settings ?? {}) };
  for (const setting of definition?.settings ?? []) {
    if (settings[setting.key] === undefined) settings[setting.key] = setting.defaultValue;
  }
  const created = workflowNodeSchema.parse({
    id: node.id,
    kind: node.kind,
    label: node.label ?? definition?.title ?? node.kind,
    settings,
    impact: definition?.impact ?? "write",
    position: node.position ?? { x: 0, y: 0 },
  });
  return { ...graph, nodes: [...graph.nodes, created] };
}

export function removeNode(graph: WorkflowGraph, nodeId: string): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    edges: graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
  };
}

export function connect(
  graph: WorkflowGraph,
  edge: { from: string; fromPort: string; to: string; toPort: string; when?: string | null },
): WorkflowGraph {
  const created = workflowEdgeSchema.parse({
    from: edge.from,
    to: edge.to,
    fromPort: edge.fromPort,
    toPort: edge.toPort,
    when: edge.when ?? null,
  });
  const duplicate = graph.edges.some(
    (existing) =>
      existing.from === created.from &&
      existing.to === created.to &&
      existing.fromPort === created.fromPort &&
      existing.toPort === created.toPort,
  );
  if (duplicate) return graph;
  return { ...graph, edges: [...graph.edges, created] };
}

export function disconnect(graph: WorkflowGraph, index: number): WorkflowGraph {
  return { ...graph, edges: graph.edges.filter((_edge, position) => position !== index) };
}

export function updateSettings(
  graph: WorkflowGraph,
  nodeId: string,
  settings: Record<string, unknown>,
): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === nodeId
        ? workflowNodeSchema.parse({ ...node, settings: { ...node.settings, ...settings } })
        : node,
    ),
  };
}
