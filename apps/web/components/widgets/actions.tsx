"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ActionValue } from "@nexus/schemas";
import { Button, InlineNote, LinkButton } from "@nexus/ui";

/**
 * Running an action is the shell's job, never a widget's.
 *
 * A widget describes what it wants to happen; the host supplies the one function
 * that validates and performs it. When no host is present — in Nexus Studio's
 * preview, for instance — a button either degrades to the action's own fallback
 * address or says plainly that it needs Nexus Desktop. It never pretends.
 */
export type ActionInvoker = (action: ActionValue) => void | Promise<void>;

const ActionContext = createContext<ActionInvoker | null>(null);

export function WidgetActionProvider({ invoke, children }: { invoke: ActionInvoker; children: ReactNode }) {
  return <ActionContext.Provider value={invoke}>{children}</ActionContext.Provider>;
}

export function useActionInvoker(): ActionInvoker | null {
  return useContext(ActionContext);
}

/** Actions that resolve to an address the browser can open on its own. */
function hrefFor(action: ActionValue): string | null {
  if (action.type === "openURL" && action.target.startsWith("https://")) return action.target;
  if (action.fallbackURL && action.fallbackURL.startsWith("https://")) return action.fallbackURL;
  return null;
}

const NEEDS_BRIDGE = new Set(["launchApplication", "openFile", "openFolder"]);

export function ActionButton({
  action,
  label,
  variant = "secondary",
  size = "medium",
}: {
  action: ActionValue | null;
  label: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "small" | "medium";
}) {
  const invoke = useActionInvoker();
  const [confirming, setConfirming] = useState(false);

  if (!action || action.type === "none") return null;

  const href = hrefFor(action);

  if (!invoke) {
    // Without a host the only honest options are the action's own web fallback,
    // or an explanation of what is missing.
    if (href) {
      return (
        <LinkButton href={href} variant={variant} size={size}>
          {label}
        </LinkButton>
      );
    }
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
        <Button variant={variant} size={size} disabled>
          {label}
        </Button>
        <InlineNote tone="caution">
          {NEEDS_BRIDGE.has(action.type)
            ? "Needs Nexus Desktop running on your Mac."
            : "This button works once the page it belongs to is open."}
        </InlineNote>
      </span>
    );
  }

  if (action.confirmationRequired && confirming) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <InlineNote tone="caution">Are you sure?</InlineNote>
        <Button
          variant="danger"
          size={size}
          onClick={() => {
            setConfirming(false);
            void invoke(action);
          }}
        >
          Yes, {label.toLowerCase()}
        </Button>
        <Button variant="quiet" size={size} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => (action.confirmationRequired ? setConfirming(true) : void invoke(action))}
    >
      {label}
    </Button>
  );
}
