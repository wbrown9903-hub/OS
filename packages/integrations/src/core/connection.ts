/**
 * The precise result of `testConnection()`.
 *
 * "It didn't work" is never an acceptable answer. Each state names exactly what
 * is wrong and exactly what the person should do next, which is what the
 * Connections screen renders.
 */

import { IntegrationError, isIntegrationError } from "./errors.js";

export type ConnectionStateKind =
  | "connected"
  | "notConfigured"
  | "invalidCredentials"
  | "insufficientPermission"
  | "wrongAddress"
  | "apiDisabled"
  | "rateLimited"
  | "unreachable"
  | "blocked"
  | "error";

export interface ConnectionState {
  /** Which of the precise outcomes this is. */
  kind: ConnectionStateKind;
  /** True only for `connected`. Convenience for widgets. */
  ok: boolean;
  /** Plain-language sentence for the person. Never contains a credential. */
  message: string;
  /** The one thing to do next. Always present, even when connected. */
  nextStep: string;
  /** Human-readable identity of what we reached, e.g. "Acme Store (GBP)". */
  identity?: string;
  /** Scopes/capabilities we could confirm. */
  grantedScopes?: string[];
  /** Scopes the user must add before the connection is useful. */
  missingScopes?: string[];
  /** When the check ran. Always recorded so the UI can say "checked 2 min ago". */
  checkedAt: string;
  /** Round-trip time of the probe, for the diagnostics panel. */
  latencyMs?: number;
  /** Extra facts the connection screen shows, e.g. WooCommerce detected. */
  facts?: Record<string, string | number | boolean>;
}

export function connected(
  identity: string,
  options: {
    grantedScopes?: string[];
    missingScopes?: string[];
    latencyMs?: number;
    facts?: Record<string, string | number | boolean>;
    checkedAt?: string;
  } = {},
): ConnectionState {
  const missing = options.missingScopes ?? [];
  if (missing.length > 0) {
    return {
      kind: "insufficientPermission",
      ok: false,
      message: `Connected to ${identity}, but some information is not permitted yet.`,
      nextStep: `Grant ${missing.join(", ")} where the credential was created, then check again.`,
      identity,
      grantedScopes: options.grantedScopes ?? [],
      missingScopes: missing,
      checkedAt: options.checkedAt ?? new Date().toISOString(),
      ...(options.latencyMs === undefined ? {} : { latencyMs: options.latencyMs }),
      ...(options.facts === undefined ? {} : { facts: options.facts }),
    };
  }
  return {
    kind: "connected",
    ok: true,
    message: `Connected to ${identity}.`,
    nextStep: "Nothing to do — add a widget to see this information on your desktop.",
    identity,
    grantedScopes: options.grantedScopes ?? [],
    missingScopes: [],
    checkedAt: options.checkedAt ?? new Date().toISOString(),
    ...(options.latencyMs === undefined ? {} : { latencyMs: options.latencyMs }),
    ...(options.facts === undefined ? {} : { facts: options.facts }),
  };
}

export function notConfigured(what: string, nextStep: string, checkedAt = new Date().toISOString()): ConnectionState {
  return { kind: "notConfigured", ok: false, message: what, nextStep, checkedAt };
}

/** Turns any thrown value into a connection state without leaking internals. */
export function connectionStateFromError(error: unknown, checkedAt = new Date().toISOString()): ConnectionState {
  if (isIntegrationError(error)) return connectionStateFromIntegrationError(error, checkedAt);
  return {
    kind: "error",
    ok: false,
    message: "Something went wrong while checking this connection.",
    nextStep: "Try again. If it keeps happening, remove the connection and set it up once more.",
    checkedAt,
  };
}

export function connectionStateFromIntegrationError(error: IntegrationError, checkedAt = new Date().toISOString()): ConnectionState {
  const base = { ok: false as const, message: error.message, nextStep: error.nextStep, checkedAt };
  switch (error.code) {
    case "notConfigured":
      return { ...base, kind: "notConfigured" };
    case "invalidCredentials":
      return { ...base, kind: "invalidCredentials" };
    case "insufficientPermission":
      return { ...base, kind: "insufficientPermission" };
    case "notFound":
      return { ...base, kind: "wrongAddress" };
    case "rateLimited":
      return { ...base, kind: "rateLimited" };
    case "unreachable":
    case "timeout":
      return { ...base, kind: "unreachable" };
    case "blockedByPolicy":
      return { ...base, kind: "blocked" };
    default:
      return { ...base, kind: "error" };
  }
}
