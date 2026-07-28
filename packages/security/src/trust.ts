import { NexusError } from "./errors.js";

/**
 * Where a piece of content came from. This is the single most important type in
 * Nexus OS's defence against prompt injection: authority is derived from
 * provenance, never from what the content says about itself.
 *
 * Port of apps/mac-bridge/Sources/SecurityCore/TrustBoundary.swift.
 */
export const CONTENT_ORIGINS = ["user", "system", "model", "external"] as const;
export type ContentOrigin = (typeof CONTENT_ORIGINS)[number];

const ORIGIN_RANK: Record<ContentOrigin, number> = {
  user: 3,
  system: 2,
  model: 1,
  external: 0,
};

/** Only a user action grants authority. Everything else is data. */
export function grantsAuthority(origin: ContentOrigin): boolean {
  return origin === "user";
}

export function compareOrigins(a: ContentOrigin, b: ContentOrigin): number {
  return ORIGIN_RANK[a] - ORIGIN_RANK[b];
}

export function explainOrigin(origin: ContentOrigin): string {
  switch (origin) {
    case "user":
      return "You provided this.";
    case "system":
      return "Nexus OS generated this from settings you saved.";
    case "model":
      return "An AI model suggested this. It has not been approved yet.";
    case "external":
      return "This came from an outside source and is treated as untrusted data.";
  }
}

/**
 * Proof that a specific action was approved by the person at the keyboard.
 * Created only by the approval flow or by a policy the user configured in advance.
 */
export class UserAuthorization {
  readonly actionIdentifier: string;
  readonly scope: string;
  readonly method: "explicitPrompt" | "preapprovedPolicy" | "trustedWorkspace";
  readonly grantedAt: Date;
  readonly isValid: boolean;

  private constructor(
    actionIdentifier: string,
    scope: string,
    method: "explicitPrompt" | "preapprovedPolicy" | "trustedWorkspace",
    grantedAt: Date,
    isValid: boolean,
  ) {
    this.actionIdentifier = actionIdentifier;
    this.scope = scope;
    this.method = method;
    this.grantedAt = grantedAt;
    this.isValid = isValid;
  }

  static granted(options: {
    actionIdentifier: string;
    scope: string;
    method: "explicitPrompt" | "preapprovedPolicy" | "trustedWorkspace";
    grantedAt?: Date;
  }): UserAuthorization {
    return new UserAuthorization(
      options.actionIdentifier,
      options.scope,
      options.method,
      options.grantedAt ?? new Date(),
      true,
    );
  }

  static denied(actionIdentifier: string): UserAuthorization {
    return new UserAuthorization(actionIdentifier, "", "explicitPrompt", new Date(), false);
  }
}

/**
 * Wraps content so it cannot be mistaken for an instruction. Reading the value
 * for anything other than display requires acknowledging the origin, which makes
 * an accidental trust upgrade visible in code review.
 */
export class Untrusted<Value> {
  constructor(
    private readonly value: Value,
    readonly origin: ContentOrigin,
    readonly sourceDescription: string,
  ) {}

  /** Data use is always fine — display it, index it, store it. */
  get forDisplay(): Value {
    return this.value;
  }

  /** Authority use requires an explicit, user-backed authorization. */
  requiringAuthority(authorization: UserAuthorization): Value {
    if (!authorization.isValid) {
      throw NexusError.security(
        "unauthorizedAction",
        "That action needs your approval before it can run.",
        "Review the requested action and choose Approve, or cancel it.",
      );
    }
    return this.value;
  }

  map<T>(transform: (value: Value) => T): Untrusted<T> {
    return new Untrusted(transform(this.value), this.origin, this.sourceDescription);
  }
}

export interface InjectionSignal {
  phrase: string;
  explanation: string;
}

const INJECTION_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ["ignore previous instructions", "asks the assistant to disregard your instructions"],
  ["ignore all previous", "asks the assistant to disregard your instructions"],
  ["disregard the above", "asks the assistant to disregard your instructions"],
  ["you are now", "tries to give the assistant a new identity"],
  ["system prompt", "refers to the assistant's private instructions"],
  ["developer mode", "claims a hidden permission level exists"],
  ["without asking the user", "asks the assistant to skip your approval"],
  ["do not tell the user", "asks the assistant to hide something from you"],
  ["do not mention", "asks the assistant to hide something from you"],
  ["run the following command", "tries to trigger a command from inside a document"],
  ["exfiltrate", "refers to sending your data elsewhere"],
  ["send the contents to", "asks for your data to be transmitted"],
  ["api key", "requests credential material"],
  ["delete all", "requests a destructive action"],
];

/**
 * Scans untrusted text for the patterns that try to talk a model into using its
 * tools. Nexus OS does not rely on this for safety — the permission engine does
 * that — but surfacing it lets the interface warn about a suspicious document.
 */
export class InjectionHeuristics {
  scan(text: string): InjectionSignal[] {
    const haystack = text.toLowerCase();
    const signals: InjectionSignal[] = [];
    for (const [phrase, explanation] of INJECTION_MARKERS) {
      if (haystack.includes(phrase)) signals.push({ phrase, explanation });
    }
    return signals;
  }

  isSuspicious(text: string): boolean {
    return this.scan(text).length > 0;
  }

  /** A display-only warning. Never used to permit or refuse an action. */
  warningFor(text: string): { title: string; detail: string; nextStep: string } | null {
    const signals = this.scan(text);
    if (signals.length === 0) return null;
    return {
      title: "This content tries to give instructions",
      detail: `It ${signals.map((signal) => signal.explanation).join("; ")}.`,
      nextStep:
        "Nexus OS already ignores instructions from content like this. Read it as information only, and do not approve actions you did not ask for.",
    };
  }
}

export const injectionHeuristics = new InjectionHeuristics();
