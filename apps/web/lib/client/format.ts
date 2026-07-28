import type { ConnectionState } from "@nexus/schemas";
import type { ConnectionRecord } from "./types";

/**
 * Shared wording.
 *
 * The product rule is that a state is never shown as a bare colour or a bare
 * number, so every state has exactly one sentence, one badge tone and one glyph,
 * defined here and nowhere else.
 */

export type Tone = "positive" | "neutral" | "caution" | "critical";

/** Shapes differ per tone so status is legible without colour vision. */
export const TONE_GLYPH: Record<Tone, string> = {
  positive: "●",
  neutral: "◇",
  caution: "▲",
  critical: "■",
};

export interface ConnectionPresentation {
  label: string;
  tone: Tone;
  glyph: string;
  explanation: string;
  nextStep: string;
}

const CONNECTION_PRESENTATION: Record<ConnectionState, ConnectionPresentation> = {
  connected: {
    label: "Connected",
    tone: "positive",
    glyph: TONE_GLYPH.positive,
    explanation: "This service is reachable and Nexus OS is receiving live information from it.",
    nextStep: "Nothing to do.",
  },
  connecting: {
    label: "Connecting",
    tone: "neutral",
    glyph: TONE_GLYPH.neutral,
    explanation: "Nexus OS is contacting the service now.",
    nextStep: "Wait a moment — this usually takes a few seconds.",
  },
  notConfigured: {
    label: "Not connected",
    tone: "neutral",
    glyph: TONE_GLYPH.neutral,
    explanation: "You have not connected this service yet, so there is nothing to show from it.",
    nextStep: "Connect it to see live information here.",
  },
  configurationRequired: {
    label: "Setup unfinished",
    tone: "caution",
    glyph: TONE_GLYPH.caution,
    explanation: "Part of the setup for this service is still missing.",
    nextStep: "Add the missing detail to finish connecting.",
  },
  permissionRequired: {
    label: "Permission needed",
    tone: "caution",
    glyph: TONE_GLYPH.caution,
    explanation: "The service is reachable but Nexus OS has not been given permission to read what it needs.",
    nextStep: "Grant the requested permission, then choose Retry.",
  },
  authenticationFailed: {
    label: "Sign-in failed",
    tone: "critical",
    glyph: TONE_GLYPH.critical,
    explanation: "The saved credential was rejected. It has probably expired or been revoked.",
    nextStep: "Re-enter the credential for this service.",
  },
  unreachable: {
    label: "Unreachable",
    tone: "critical",
    glyph: TONE_GLYPH.critical,
    explanation: "Nexus OS could not reach the service at all.",
    nextStep: "Check your internet connection, then choose Retry.",
  },
  rateLimited: {
    label: "Rate limited",
    tone: "caution",
    glyph: TONE_GLYPH.caution,
    explanation: "The service is temporarily limiting how often Nexus OS may ask it for information.",
    nextStep: "Nothing to do — Nexus OS will retry automatically.",
  },
  disabled: {
    label: "Turned off",
    tone: "neutral",
    glyph: TONE_GLYPH.neutral,
    explanation: "You switched this connection off, so Nexus OS is not contacting it.",
    nextStep: "Switch it back on to use it again.",
  },
  error: {
    label: "Needs attention",
    tone: "critical",
    glyph: TONE_GLYPH.critical,
    explanation: "Something went wrong with this connection that Nexus OS could not resolve on its own.",
    nextStep: "Open the connection to see exactly what happened.",
  },
};

export function describeConnection(state: ConnectionState): ConnectionPresentation {
  return CONNECTION_PRESENTATION[state] ?? CONNECTION_PRESENTATION.error;
}

export function connectionSummary(connections: ConnectionRecord[]): {
  label: string;
  tone: Tone;
  glyph: string;
  detail: string;
} {
  if (connections.length === 0) {
    return {
      label: "No connections",
      tone: "neutral",
      glyph: TONE_GLYPH.neutral,
      detail: "Nexus OS is not signed in to any service yet. Everything local still works.",
    };
  }
  const failing = connections.filter((connection) =>
    ["authenticationFailed", "unreachable", "error"].includes(connection.state),
  );
  const attention = connections.filter((connection) =>
    ["configurationRequired", "permissionRequired", "rateLimited"].includes(connection.state),
  );
  const connected = connections.filter((connection) => connection.state === "connected");

  if (failing.length > 0) {
    return {
      label: `${failing.length} need${failing.length === 1 ? "s" : ""} attention`,
      tone: "critical",
      glyph: TONE_GLYPH.critical,
      detail: failing.map((connection) => connection.label).join(", "),
    };
  }
  if (attention.length > 0) {
    return {
      label: `${attention.length} unfinished`,
      tone: "caution",
      glyph: TONE_GLYPH.caution,
      detail: attention.map((connection) => connection.label).join(", "),
    };
  }
  return {
    label: `${connected.length} connected`,
    tone: "positive",
    glyph: TONE_GLYPH.positive,
    detail: connected.map((connection) => connection.label).join(", ") || "Nothing connected yet.",
  };
}

export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "unknown";
  const seconds = Math.max(0, Math.round((now.getTime() - timestamp) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes ago`;
  if (seconds < 7200) return "an hour ago";
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours ago`;
  if (seconds < 172800) return "yesterday";
  return `${Math.round(seconds / 86400)} days ago`;
}

export function titleCase(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}
