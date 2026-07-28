import type { ConfigDocument } from "./document.js";

/**
 * Every change to the interface — dragging a widget, renaming a heading, changing
 * a colour, importing a theme, resetting a page — is expressed as one of four
 * primitive operations, each of which can compute its own exact inverse.
 *
 * That single property is what turns six separate product features into one
 * mechanism:
 *
 *   undo / redo        → apply the inverse / re-apply the operation
 *   version history    → the list of committed transactions
 *   draft and publish  → a transaction list not yet merged into the live document
 *   reset a component  → a transaction that sets it back to its defaults
 *   import / export    → a transaction containing a single document replacement
 *   audit log          → the same transactions, with who and when attached
 *
 * Nothing here knows what a widget is. It operates on the document tree, so new
 * widget types and new settings never require new operation code.
 */

/** A path segment addresses an object key, an array index, or an array item by id. */
export type PathSegment = string | number | { id: string };
export type Path = PathSegment[];

export type Operation =
  /** Replace the value at `path`. `previous` is filled in when the inverse is built. */
  | { op: "set"; path: Path; value: unknown }
  /** Insert `value` into the array at `path`, at position `index`. */
  | { op: "insert"; path: Path; index: number; value: unknown }
  /** Remove the item at `index` from the array at `path`. */
  | { op: "remove"; path: Path; index: number }
  /** Move an item within the array at `path`. */
  | { op: "move"; path: Path; from: number; to: number };

export interface Transaction {
  id: string;
  /** Shown verbatim in version history and in the undo tooltip. */
  label: string;
  operations: Operation[];
  /** The exact operations that undo this transaction, in the order to apply them. */
  inverse: Operation[];
  timestamp: string;
  /** "user" for direct edits, or a workflow/plugin/assistant identifier. */
  author: string;
}

export class OperationError extends Error {
  constructor(
    message: string,
    readonly recovery: string,
  ) {
    super(message);
    this.name = "OperationError";
  }
}

/* -------------------------------------------------------------------------- */
/* Path resolution                                                             */
/* -------------------------------------------------------------------------- */

function describePath(path: Path): string {
  return path.map((segment) => (typeof segment === "object" ? `#${segment.id}` : String(segment))).join(".");
}

function resolveSegment(container: unknown, segment: PathSegment, path: Path): unknown {
  if (container === null || container === undefined) {
    throw new OperationError(
      `Nothing exists at ${describePath(path)}.`,
      "The layout may have changed since this edit was made. Reload the page and try again.",
    );
  }
  if (typeof segment === "object") {
    if (!Array.isArray(container)) {
      throw new OperationError(
        `Expected a list at ${describePath(path)}.`,
        "Reload the page. If this keeps happening, restore the previous version from Version History.",
      );
    }
    const found = (container as Array<{ id?: string }>).find((item) => item?.id === segment.id);
    if (found === undefined) {
      throw new OperationError(
        `The item “${segment.id}” no longer exists.`,
        "It may have been deleted in another window. Reload the page to see the current layout.",
      );
    }
    return found;
  }
  return (container as Record<string | number, unknown>)[segment];
}

/** Walks to the parent of the final segment, returning it plus that final key. */
function walk(root: unknown, path: Path): { parent: unknown; key: string | number } {
  if (path.length === 0) {
    throw new OperationError("An edit did not say what to change.", "Try the edit again.");
  }
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    current = resolveSegment(current, path[index]!, path.slice(0, index + 1));
  }
  const last = path[path.length - 1]!;
  if (typeof last === "object") {
    if (!Array.isArray(current)) {
      throw new OperationError("Expected a list.", "Reload the page and try again.");
    }
    const index = (current as Array<{ id?: string }>).findIndex((item) => item?.id === last.id);
    if (index === -1) {
      throw new OperationError(
        `The item “${last.id}” no longer exists.`,
        "Reload the page to see the current layout.",
      );
    }
    return { parent: current, key: index };
  }
  return { parent: current, key: last };
}

export function readAtPath(root: unknown, path: Path): unknown {
  if (path.length === 0) return root;
  const { parent, key } = walk(root, path);
  return (parent as Record<string | number, unknown>)[key];
}

/* -------------------------------------------------------------------------- */
/* Applying operations                                                         */
/* -------------------------------------------------------------------------- */

/** Computes the operation that exactly undoes `operation` against `document`. */
export function invertOperation(document: ConfigDocument, operation: Operation): Operation {
  switch (operation.op) {
    case "set":
      return { op: "set", path: operation.path, value: structuredClone(readAtPath(document, operation.path)) };
    case "insert":
      return { op: "remove", path: operation.path, index: operation.index };
    case "remove": {
      const array = readAtPath(document, operation.path) as unknown[];
      const removed = array?.[operation.index];
      if (removed === undefined) {
        throw new OperationError(
          "The item being removed no longer exists.",
          "Reload the page to see the current layout.",
        );
      }
      return { op: "insert", path: operation.path, index: operation.index, value: structuredClone(removed) };
    }
    case "move":
      return { op: "move", path: operation.path, from: operation.to, to: operation.from };
  }
}

function applyInPlace(draft: ConfigDocument, operation: Operation): void {
  switch (operation.op) {
    case "set": {
      const { parent, key } = walk(draft, operation.path);
      (parent as Record<string | number, unknown>)[key] = structuredClone(operation.value);
      return;
    }
    case "insert": {
      const array = readAtPath(draft, operation.path);
      if (!Array.isArray(array)) {
        throw new OperationError("Expected a list to add to.", "Reload the page and try again.");
      }
      const index = Math.max(0, Math.min(operation.index, array.length));
      array.splice(index, 0, structuredClone(operation.value));
      return;
    }
    case "remove": {
      const array = readAtPath(draft, operation.path);
      if (!Array.isArray(array)) {
        throw new OperationError("Expected a list to remove from.", "Reload the page and try again.");
      }
      if (operation.index < 0 || operation.index >= array.length) {
        throw new OperationError(
          "That item has already been removed.",
          "Reload the page to see the current layout.",
        );
      }
      array.splice(operation.index, 1);
      return;
    }
    case "move": {
      const array = readAtPath(draft, operation.path);
      if (!Array.isArray(array)) {
        throw new OperationError("Expected a list to reorder.", "Reload the page and try again.");
      }
      if (operation.from < 0 || operation.from >= array.length) {
        throw new OperationError("That item has moved.", "Reload the page and try again.");
      }
      const [item] = array.splice(operation.from, 1);
      array.splice(Math.max(0, Math.min(operation.to, array.length)), 0, item);
      return;
    }
  }
}

/**
 * Applies a set of operations as one all-or-nothing transaction.
 *
 * The document is never mutated: a copy is produced, and if any operation fails
 * the original is returned untouched. A half-applied edit is therefore impossible,
 * which is what lets the editor autosave aggressively without risking the layout.
 */
export function commit(
  document: ConfigDocument,
  operations: Operation[],
  options: { label: string; author?: string; id?: string; now?: () => Date },
): { document: ConfigDocument; transaction: Transaction } {
  if (operations.length === 0) {
    throw new OperationError("That edit contained no changes.", "Make a change first, then save.");
  }

  const draft = structuredClone(document);
  const inverse: Operation[] = [];

  for (const operation of operations) {
    // The inverse must be computed against the state *before* the operation runs.
    inverse.unshift(invertOperation(draft, operation));
    applyInPlace(draft, operation);
  }

  draft.revision = document.revision + 1;

  const now = options.now?.() ?? new Date();
  return {
    document: draft,
    transaction: {
      id: options.id ?? `txn_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      label: options.label,
      operations: structuredClone(operations),
      inverse,
      timestamp: now.toISOString(),
      author: options.author ?? "user",
    },
  };
}

/** Applies a transaction's inverse. Used by undo and by "restore this version". */
export function revert(
  document: ConfigDocument,
  transaction: Transaction,
): { document: ConfigDocument } {
  const draft = structuredClone(document);
  for (const operation of transaction.inverse) applyInPlace(draft, operation);
  draft.revision = document.revision + 1;
  return { document: draft };
}

/* -------------------------------------------------------------------------- */
/* Undo / redo stack                                                           */
/* -------------------------------------------------------------------------- */

export interface HistoryState {
  past: Transaction[];
  future: Transaction[];
}

export const emptyHistory: HistoryState = { past: [], future: [] };

export function pushHistory(history: HistoryState, transaction: Transaction, limit = 200): HistoryState {
  const past = [...history.past, transaction];
  // A new edit invalidates the redo branch, matching every editor users know.
  return { past: past.slice(Math.max(0, past.length - limit)), future: [] };
}

export function undo(
  document: ConfigDocument,
  history: HistoryState,
): { document: ConfigDocument; history: HistoryState; label: string | null } {
  const transaction = history.past[history.past.length - 1];
  if (!transaction) return { document, history, label: null };
  const { document: reverted } = revert(document, transaction);
  return {
    document: reverted,
    history: { past: history.past.slice(0, -1), future: [transaction, ...history.future] },
    label: transaction.label,
  };
}

export function redo(
  document: ConfigDocument,
  history: HistoryState,
): { document: ConfigDocument; history: HistoryState; label: string | null } {
  const [transaction, ...rest] = history.future;
  if (!transaction) return { document, history, label: null };
  const { document: reapplied } = commit(document, transaction.operations, {
    label: transaction.label,
    author: transaction.author,
    id: transaction.id,
  });
  return {
    document: reapplied,
    history: { past: [...history.past, transaction], future: rest },
    label: transaction.label,
  };
}
