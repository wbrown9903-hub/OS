import type { ConnectionState } from "@nexus/schemas";

/**
 * The shapes the shell consumes from the server API. They mirror the documented
 * contract in CLAUDE.md; the route handlers themselves are owned by another
 * agent, so everything here is defensive about missing or partial payloads.
 */

export interface ConnectionRecord {
  id: string;
  service: string;
  label: string;
  state: ConnectionState;
  lastCheckedAt: string | null;
}

export interface BridgeStatus {
  available: boolean;
  deviceName: string | null;
  version: string | null;
}

export type NotificationTone = "info" | "positive" | "caution" | "critical";

export interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  category: string;
  tone: NotificationTone;
  createdAt: string;
  read: boolean;
  /** In-app destination that resolves whatever the notification is about. */
  href: string | null;
}

export interface HelpStep {
  title: string;
  body: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  steps: HelpStep[];
  related: string[];
}

export interface SearchResult {
  kind: string;
  title: string;
  subtitle: string;
  href: string | null;
  action: string | null;
}

/** A single failure the interface can explain rather than swallow. */
export interface ProblemReport {
  message: string;
  nextStep: string;
  /** Screen that fixes it, when one exists. */
  href?: string | null;
}
