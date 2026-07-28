/**
 * The single response shape every Nexus OS API route uses.
 *
 * One envelope means the browser has exactly one place to look for an error, and
 * every error carries a plain-language message plus the next step — the product
 * rule that "every error shown to a person has a message and a next step" is
 * enforced by the type system rather than by review.
 */

export interface ApiErrorPayload {
  /** Plain language. Never contains a secret, a stack trace or a code name. */
  message: string;
  /** The concrete thing the person can do next. Never empty. */
  recovery: string;
  /** Stable identifier such as "security.blockedScheme", for client branching. */
  code: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  ok: false;
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.ok;
}

/** Cookie name for the session. httpOnly, SameSite=Lax, set by the auth routes. */
export const SESSION_COOKIE_NAME = "nexus_session";

/** How long a session lasts before the person has to sign in again. */
export const SESSION_TTL_DAYS = 30;
