/**
 * One error vocabulary for every integration.
 *
 * Product rule: an error a person sees always has a plain-language message and a
 * next step. `IntegrationError` carries both, so no call site has to invent
 * wording and no widget can render a bare stack trace.
 */

export type IntegrationErrorCode =
  /** No credential stored, or the connection was never set up. */
  | "notConfigured"
  /** The credential exists but the service rejected it. */
  | "invalidCredentials"
  /** Authenticated, but the token is missing a scope/capability. */
  | "insufficientPermission"
  /** The address is wrong: wrong host, wrong path, or not the expected service. */
  | "notFound"
  /** The service asked us to slow down. */
  | "rateLimited"
  /** Network failure, DNS failure or timeout. */
  | "unreachable"
  /** The request took longer than the configured timeout. */
  | "timeout"
  /** The service replied, but not with anything we can use. */
  | "badResponse"
  /** The service is down or returned 5xx after every retry. */
  | "serviceError"
  /** We refused to make the request (URL policy, unsafe media, …). */
  | "blockedByPolicy"
  /** The requested model/resource does not exist for this account. */
  | "resourceUnavailable"
  /** Anything else, always with a message we can show. */
  | "unknown";

export interface IntegrationErrorOptions {
  /** HTTP status, when there was one. */
  status?: number;
  /** Seconds the service asked us to wait, when it said. */
  retryAfterSeconds?: number;
  /** Machine detail for the log. Redacted before it is written. */
  detail?: string;
  /** Underlying cause, kept for debugging but never shown to a person. */
  cause?: unknown;
  /** Whether retrying the same request could plausibly succeed. */
  retryable?: boolean;
}

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly service: string;
  readonly nextStep: string;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly detail: string;
  readonly retryable: boolean;

  constructor(
    service: string,
    code: IntegrationErrorCode,
    message: string,
    nextStep: string,
    options: IntegrationErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "IntegrationError";
    this.service = service;
    this.code = code;
    this.nextStep = nextStep;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.detail = options.detail ?? "";
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE.has(code);
  }

  /** Safe to store or send to the browser: no credentials, no stack. */
  toJSON(): {
    service: string;
    code: IntegrationErrorCode;
    message: string;
    nextStep: string;
    status?: number;
    retryAfterSeconds?: number;
    retryable: boolean;
  } {
    return {
      service: this.service,
      code: this.code,
      message: this.message,
      nextStep: this.nextStep,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: this.retryAfterSeconds }),
      retryable: this.retryable,
    };
  }
}

const DEFAULT_RETRYABLE = new Set<IntegrationErrorCode>(["rateLimited", "unreachable", "timeout", "serviceError"]);

export function isIntegrationError(value: unknown): value is IntegrationError {
  return value instanceof IntegrationError;
}

/**
 * Maps an HTTP status onto the shared vocabulary. Individual clients refine
 * this (Shopify's 402 means "shop frozen", WordPress's 401 vs 403 differ), but
 * every client starts here so behaviour is consistent.
 */
export function errorForStatus(
  service: string,
  status: number,
  options: IntegrationErrorOptions & { subject?: string } = {},
): IntegrationError {
  const subject = options.subject ?? service;
  switch (status) {
    case 400:
      return new IntegrationError(service, "badResponse", `${subject} rejected the request as invalid.`, "This is usually a Nexus bug — please report it with the time it happened.", options);
    case 401:
      return new IntegrationError(service, "invalidCredentials", `${subject} did not accept the saved credentials.`, "Open Settings › Connections and enter the credentials again.", options);
    case 403:
      return new IntegrationError(service, "insufficientPermission", `The saved credentials do not have permission for that in ${subject}.`, "Grant the missing permission where the credential was created, then reconnect.", options);
    case 404:
      return new IntegrationError(service, "notFound", `${subject} could not find that address.`, "Check the site or shop address in Settings › Connections.", options);
    case 408:
      return new IntegrationError(service, "timeout", `${subject} took too long to reply.`, "Try again in a moment.", options);
    case 429:
      return new IntegrationError(service, "rateLimited", `${subject} asked Nexus to slow down.`, "Nexus will retry automatically — no action needed.", options);
    default:
      if (status >= 500) {
        return new IntegrationError(service, "serviceError", `${subject} reported a problem on its side.`, "Wait a few minutes and try again; nothing is wrong with your settings.", options);
      }
      return new IntegrationError(service, "unknown", `${subject} replied with an unexpected status (${status}).`, "Try again; if it keeps happening, reconnect the service.", options);
  }
}
