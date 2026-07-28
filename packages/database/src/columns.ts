import { z } from "zod";
import { configDocumentSchema, type ConfigDocument, type Operation, type Transaction } from "@nexus/schemas";
import { NexusError } from "@nexus/security";

/**
 * Typed access to the JSON-in-String columns.
 *
 * The schema stores JSON-shaped values as `String` so one Prisma schema is valid
 * on both SQLite and PostgreSQL. The cost of that decision is that every read is
 * a parse that can fail, so this module is the only place in the product allowed
 * to call `JSON.parse` on a column. Call sites use a named column helper, get a
 * fully typed value back, and get a user-facing error with a recovery step when a
 * row is corrupt — instead of an unhandled `SyntaxError` three layers up.
 */

export interface JsonColumn<T> {
  /** Parses and validates. `label` names the row in any error shown to a person. */
  read(raw: string | null | undefined, label?: string): T;
  /** Parses, returning `null` instead of throwing. For "best effort" listings. */
  tryRead(raw: string | null | undefined): T | null;
  write(value: T): string;
}

function corrupt(label: string, reason: string): NexusError {
  return new NexusError(
    "storage",
    "unreadableRecord",
    `The saved ${label} could not be read because its contents are not valid.`,
    "Restore the most recent backup from Settings › Backup, or reset this item from Settings › Recovery.",
    { reason },
  );
}

export function jsonColumn<Schema extends z.ZodTypeAny>(
  schema: Schema,
  options: { label: string; fallback?: () => z.output<Schema> },
): JsonColumn<z.output<Schema>> {
  type T = z.output<Schema>;
  const parse = (raw: string | null | undefined, label: string, throwOnFailure: boolean): T | null => {
    if (raw === null || raw === undefined || raw.length === 0) {
      if (options.fallback) return options.fallback();
      if (!throwOnFailure) return null;
      throw corrupt(label, "the value was empty");
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch (error) {
      if (!throwOnFailure) return null;
      throw corrupt(label, error instanceof Error ? error.message : "not valid JSON");
    }
    const result = schema.safeParse(decoded);
    if (!result.success) {
      if (!throwOnFailure) return null;
      throw corrupt(label, result.error.issues.map((issue) => issue.path.join(".") || "value").join(", "));
    }
    return result.data;
  };

  return {
    read: (raw, label) => parse(raw, label ?? options.label, true) as T,
    tryRead: (raw) => parse(raw, options.label, false),
    write: (value) => JSON.stringify(value),
  };
}

/* -------------------------------------------------------------------------- */
/* Schemas for the columns that do not already have one                        */
/* -------------------------------------------------------------------------- */

const pathSegmentSchema: z.ZodType<string | number | { id: string }> = z.union([
  z.string(),
  z.number(),
  z.object({ id: z.string() }),
]);

const operationUnion = z.union([
  z.object({ op: z.literal("set"), path: z.array(pathSegmentSchema), value: z.unknown() }),
  z.object({
    op: z.literal("insert"),
    path: z.array(pathSegmentSchema),
    index: z.number(),
    value: z.unknown(),
  }),
  z.object({ op: z.literal("remove"), path: z.array(pathSegmentSchema), index: z.number() }),
  z.object({
    op: z.literal("move"),
    path: z.array(pathSegmentSchema),
    from: z.number(),
    to: z.number(),
  }),
]);

/** Cast at the boundary: zod widens `z.unknown()` fields to optional on output,
 *  while `Operation` declares `value` as required-but-unknown. The runtime shape
 *  is identical; only the declared optionality differs. */
export const operationSchema = operationUnion as unknown as z.ZodType<Operation, z.ZodTypeDef, unknown>;

export const operationListSchema = z.array(operationSchema);

/**
 * A workflow graph. `packages/workflows` owns the execution semantics; this is
 * the storage contract, kept deliberately structural so a graph written by a
 * newer version still round-trips through the database intact.
 */
export const workflowGraphSchema = z.object({
  version: z.number().default(1),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        label: z.string().default(""),
        settings: z.record(z.string(), z.unknown()).default({}),
        /** read | write | destructive | system — surfaced before a run. */
        impact: z.enum(["read", "write", "destructive", "system"]).default("read"),
      }),
    )
    .default([]),
  edges: z
    .array(z.object({ from: z.string(), to: z.string(), when: z.string().nullable().default(null) }))
    .default([]),
  trigger: z
    .object({
      kind: z.enum(["manual", "schedule", "webhook", "event"]).default("manual"),
      value: z.string().default(""),
    })
    .default({}),
});
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

export const workflowStepListSchema = z.array(
  z.object({
    nodeId: z.string(),
    status: z.enum(["pending", "running", "succeeded", "failed", "skipped", "awaitingApproval"]),
    startedAt: z.string().nullable().default(null),
    finishedAt: z.string().nullable().default(null),
    summary: z.string().default(""),
    error: z.string().nullable().default(null),
  }),
);
export type WorkflowStepRecord = z.infer<typeof workflowStepListSchema>[number];

export const settingsObjectSchema = z.record(z.string(), z.unknown());
export const stringListSchema = z.array(z.string());

export const transactionSchema = z.object({
  id: z.string(),
  label: z.string(),
  operations: operationListSchema,
  inverse: operationListSchema,
  timestamp: z.string(),
  author: z.string(),
}) as unknown as z.ZodType<Transaction, z.ZodTypeDef, unknown>;

export const mediaAttributionSchema = z.object({
  sourceURL: z.string(),
  label: z.string(),
  retrievedAt: z.string(),
});

/* -------------------------------------------------------------------------- */
/* The named columns                                                           */
/* -------------------------------------------------------------------------- */

/** `ConfigRecord.document` — the one configuration document. */
export const documentColumn: JsonColumn<ConfigDocument> = jsonColumn(configDocumentSchema, {
  label: "layout",
});

/** `ConfigTransaction.operations` and `.inverse`. */
export const operationsColumn: JsonColumn<Operation[]> = jsonColumn(operationListSchema, {
  label: "edit",
  fallback: () => [],
});

/** A whole transaction, used by export, import and backup. */
export const transactionColumn: JsonColumn<Transaction> = jsonColumn(transactionSchema, {
  label: "edit",
});

/** `Workflow.graph`. */
export const graphColumn: JsonColumn<WorkflowGraph> = jsonColumn(workflowGraphSchema, {
  label: "workflow",
  fallback: () => workflowGraphSchema.parse({}),
});

/** `WorkflowRun.steps`. */
export const workflowStepsColumn: JsonColumn<WorkflowStepRecord[]> = jsonColumn(
  workflowStepListSchema,
  { label: "workflow run", fallback: () => [] },
);

/** `Connection.settings`, `McpTool.inputSchema`, `PluginInstall.manifest`. */
export const settingsColumn: JsonColumn<Record<string, unknown>> = jsonColumn(settingsObjectSchema, {
  label: "settings",
  fallback: () => ({}),
});

/** `KnowledgeItem.tags`, `Connection.scopes`, `MemoryRecord.sharedWith`, and friends. */
export const tagsColumn: JsonColumn<string[]> = jsonColumn(stringListSchema, {
  label: "tags",
  fallback: () => [],
});

/** Alias that reads better at non-tag call sites. Same behaviour. */
export const stringListColumn: JsonColumn<string[]> = tagsColumn;

/** `MediaAsset.attribution`. */
export const attributionColumn: JsonColumn<z.infer<typeof mediaAttributionSchema>> = jsonColumn(
  mediaAttributionSchema,
  { label: "image attribution" },
);

/** `BackupRecord.contents` — the manifest of what a backup contains. */
export const backupContentsColumn: JsonColumn<Array<{ kind: string; count: number }>> = jsonColumn(
  z.array(z.object({ kind: z.string(), count: z.number() })),
  { label: "backup", fallback: () => [] },
);
