/**
 * The TypeScript counterpart of `NexusError` in apps/mac-bridge/Sources/AppCore.
 *
 * Every failure that can reach a person carries three things: what went wrong, the
 * concrete next step, and a stable code. The two implementations deliberately use
 * the same domains, the same codes and the same wording so a problem reported on
 * the Mac and the same problem reported in the browser read identically.
 */

export type NexusErrorDomain =
  | "configuration"
  | "security"
  | "permission"
  | "network"
  | "storage"
  | "workflow"
  | "integration"
  | "plugin"
  | "validation"
  | "migration"
  | "notFound"
  | "cancelled"
  | "unsupported";

/** The shape every API error response uses. Never contains secrets. */
export interface NexusErrorPayload {
  message: string;
  recovery: string;
  code: string;
}

export class NexusError extends Error {
  readonly domain: NexusErrorDomain;
  /** Short, stable identifier, e.g. "blockedScheme". */
  readonly code: string;
  /** The concrete next action the user can take. Never empty. */
  readonly recovery: string;
  /** Developer-facing context. Redacted before it reaches any log sink. */
  readonly context: Readonly<Record<string, string>>;

  constructor(
    domain: NexusErrorDomain,
    code: string,
    message: string,
    recovery: string,
    context: Record<string, string> = {},
  ) {
    super(message);
    this.name = "NexusError";
    this.domain = domain;
    this.code = code;
    this.recovery = recovery;
    this.context = Object.freeze({ ...context });
  }

  /** Globally unique code used by clients for branching, e.g. "security.blockedScheme". */
  get qualifiedCode(): string {
    return `${this.domain}.${this.code}`;
  }

  get description(): string {
    return `[${this.qualifiedCode}] ${this.message} — ${this.recovery}`;
  }

  adding(extra: Record<string, string>): NexusError {
    return new NexusError(this.domain, this.code, this.message, this.recovery, {
      ...this.context,
      ...extra,
    });
  }

  toPayload(): NexusErrorPayload {
    return { message: this.message, recovery: this.recovery, code: this.qualifiedCode };
  }

  toJSON(): NexusErrorPayload {
    return this.toPayload();
  }

  /** The HTTP status that matches this domain, so route handlers never guess. */
  get httpStatus(): number {
    switch (this.domain) {
      case "validation":
      case "configuration":
        return 400;
      case "permission":
        return 403;
      case "security":
        return 400;
      case "notFound":
        return 404;
      case "cancelled":
        return 409;
      case "unsupported":
        return 501;
      case "network":
      case "integration":
        return 502;
      default:
        return 500;
    }
  }

  static validation(code: string, message: string, recovery: string): NexusError {
    return new NexusError("validation", code, message, recovery);
  }
  static security(code: string, message: string, recovery: string): NexusError {
    return new NexusError("security", code, message, recovery);
  }
  static permission(code: string, message: string, recovery: string): NexusError {
    return new NexusError("permission", code, message, recovery);
  }
  static storage(code: string, message: string, recovery: string): NexusError {
    return new NexusError("storage", code, message, recovery);
  }
  static network(code: string, message: string, recovery: string): NexusError {
    return new NexusError("network", code, message, recovery);
  }
  static notFound(what: string, recovery: string): NexusError {
    return new NexusError("notFound", "missing", `${what} could not be found.`, recovery);
  }
  static unsupported(what: string, recovery: string): NexusError {
    return new NexusError("unsupported", "unsupported", `${what} is not supported here.`, recovery);
  }
  static conflict(code: string, message: string, recovery: string): NexusError {
    return new NexusError("cancelled", code, message, recovery);
  }
}

export function isNexusError(value: unknown): value is NexusError {
  return value instanceof NexusError;
}

/**
 * Turns anything thrown into a user-facing error. An unexpected failure still
 * gets a plain message and a next step rather than a stack trace.
 */
export function toNexusError(value: unknown): NexusError {
  if (isNexusError(value)) return value;
  if (value instanceof Error) {
    return new NexusError(
      "storage",
      "unexpected",
      "Something went wrong while completing that request.",
      "Try again. If it keeps happening, open Settings › Recovery and export a backup before continuing.",
      { reason: value.message },
    );
  }
  return new NexusError(
    "storage",
    "unexpected",
    "Something went wrong while completing that request.",
    "Try again. If it keeps happening, restart Nexus OS.",
    { reason: String(value) },
  );
}
