"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { Operation } from "@nexus/schemas";
import { apiPost } from "./api";
import { useShell, type PanelDescriptor } from "./shell-store";

/**
 * Actions are structured values, never free-form strings.
 *
 * Anything in the interface that "does something" — a dock tile, a palette
 * result, a natural-language phrase, a widget button — produces one of these and
 * hands it to `useActionRunner`. That is what keeps a configuration document, or
 * a phrase typed into the palette, from ever becoming arbitrary behaviour: an
 * action can only be one of the shapes below, and each shape has exactly one
 * implementation.
 */
export type ShellAction =
  | { kind: "navigate"; href: string }
  | { kind: "openExternal"; url: string }
  | { kind: "switchWorkspace"; workspaceId: string }
  | { kind: "openPanel"; panel: PanelDescriptor }
  | { kind: "openPalette"; seed?: string }
  | { kind: "openHelp"; topicId: string; title: string }
  | { kind: "applyOperations"; operations: Operation[]; label: string }
  | { kind: "bridge"; action: string; parameters: Record<string, string>; description: string }
  | { kind: "refreshServices" }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "exitToDesktop" }
  /** A documented action this build cannot perform. It is explained, never faked. */
  | { kind: "unsupported"; reason: string; nextStep: string; href: string | null };

export interface ConfirmationSpec {
  title: string;
  body: string;
  confirmLabel: string;
  destructive: boolean;
}

export interface RunnableIntent {
  /** Imperative label, e.g. "Open RuneScape". */
  title: string;
  /** Plain-language description of exactly what will happen. */
  detail: string;
  action: ShellAction;
  /** Present when the action changes something the user would want to be asked about. */
  confirmation: ConfirmationSpec | null;
}

/* -------------------------------------------------------------------------- */
/* URL safety                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A last line of defence in the browser. The server performs the authoritative
 * check (`packages/security`); this stops the interface from ever *offering* a
 * link it would be wrong to open.
 */
export function isSafeExternalURL(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const parts = host.split(".").map((part) => Number(part));
      const [a, b] = [parts[0] ?? 0, parts[1] ?? 0];
      if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return false;
      if (a === 169 && b === 254) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Mapping the document's action vocabulary onto shell actions                 */
/* -------------------------------------------------------------------------- */

const INTERNAL_ROUTE = /^\/[a-z0-9\-/?=&._]*$/i;

/**
 * Dock items and widget buttons store `{ type, target }`. Unknown types are
 * expected — a newer document, or a plugin that is disabled — so this always
 * returns something explainable rather than throwing.
 */
export function actionFromDocument(
  documentAction: { type: string; target: string },
  label: string,
): RunnableIntent {
  const { type, target } = documentAction;

  if (type === "openPage" || type === "openScreen" || (type === "runCommand" && INTERNAL_ROUTE.test(target))) {
    return { title: `Open ${label}`, detail: `Goes to ${target}.`, action: { kind: "navigate", href: target }, confirmation: null };
  }

  if (INTERNAL_ROUTE.test(target) && (type === "none" || type === "" || type === "openPanel")) {
    return { title: `Open ${label}`, detail: `Goes to ${target}.`, action: { kind: "navigate", href: target }, confirmation: null };
  }

  if (type === "switchWorkspace") {
    return {
      title: `Switch to ${label}`,
      detail: "Changes the active workspace and the dashboard it shows.",
      action: { kind: "switchWorkspace", workspaceId: target },
      confirmation: null,
    };
  }

  if (type === "openURL") {
    if (!isSafeExternalURL(target)) {
      return {
        title: `Open ${label}`,
        detail: "This link is not a plain https web address, so Nexus OS will not open it.",
        action: {
          kind: "unsupported",
          reason: "That link is not an https web address.",
          nextStep: "Edit the item in Nexus Studio and give it a full https:// address.",
          href: null,
        },
        confirmation: null,
      };
    }
    return {
      title: `Open ${label}`,
      detail: `Opens ${target} in your browser.`,
      action: { kind: "openExternal", url: target },
      confirmation: null,
    };
  }

  if (type === "launchApplication") {
    return {
      title: `Launch ${label}`,
      detail: `Asks Nexus Desktop on your Mac to open ${target}.`,
      action: {
        kind: "bridge",
        action: "launchApplication",
        parameters: { target },
        description: `Launch ${label}`,
      },
      confirmation: {
        title: `Launch ${label}?`,
        body: `Nexus OS will ask the Mac Bridge to open ${target} on your Mac.`,
        confirmLabel: "Launch",
        destructive: false,
      },
    };
  }

  if (type === "showTutorial") {
    return {
      title: `Show the ${label} walkthrough`,
      detail: "Opens the step-by-step guide in a panel.",
      action: { kind: "openHelp", topicId: target, title: label },
      confirmation: null,
    };
  }

  if (type === "openFile" || type === "openFolder") {
    return {
      title: `Open ${label}`,
      detail: `Asks Nexus Desktop to reveal ${target} on your Mac.`,
      action: { kind: "bridge", action: type, parameters: { target }, description: `Open ${target}` },
      confirmation: {
        title: `Open ${target}?`,
        body: "Nexus OS will ask the Mac Bridge to open this on your Mac.",
        confirmLabel: "Open",
        destructive: false,
      },
    };
  }

  if (type === "openPanel") {
    return {
      title: `Open ${label}`,
      detail: "Opens this inside Nexus, without leaving the dashboard.",
      action: {
        kind: "openPanel",
        panel: { id: `panel-${target}`, title: label, content: { kind: "destination", href: `/${target}` } },
      },
      confirmation: null,
    };
  }

  if (type === "switchWorkspace") {
    return {
      title: `Switch to ${label}`,
      detail: "Changes which workspace is active.",
      action: { kind: "switchWorkspace", workspaceId: target },
      confirmation: null,
    };
  }

  if (type === "runCommand") {
    return {
      title: label,
      detail: "Opens the command bar with this already typed, so you can see what it will do.",
      action: { kind: "openPalette", seed: target },
      confirmation: null,
    };
  }

  if (type === "runWorkflow") {
    return {
      title: `Run ${label}`,
      detail: "Opens the workflow so you can see what it does before running it.",
      action: { kind: "navigate", href: `/workflows?workflow=${encodeURIComponent(target)}` },
      confirmation: null,
    };
  }

  if (type === "invokeMCPTool") {
    return {
      title: `Use the ${label} tool`,
      detail: "Opens the MCP Centre, where the tool's permissions are shown before it can run.",
      action: { kind: "navigate", href: `/mcp?tool=${encodeURIComponent(target)}` },
      confirmation: null,
    };
  }

  return {
    title: label,
    detail: `This item asks for “${type}”, which this version of Nexus OS does not know how to do.`,
    action: {
      kind: "unsupported",
      reason: `“${type}” is not an action this version of Nexus OS can perform.`,
      nextStep: "Update Nexus OS, or edit this item in Nexus Studio and choose a different action.",
      href: "/settings/about",
    },
    confirmation: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                      */
/* -------------------------------------------------------------------------- */

export function useActionRunner(): (intent: RunnableIntent) => Promise<void> {
  const router = useRouter();
  const shell = useShell();
  const {
    confirm,
    toast,
    openPanel,
    setPaletteOpen,
    setActiveWorkspaceId,
    applyOperations,
    refreshServices,
    undo,
    redo,
  } = shell;

  return useCallback(
    async (intent: RunnableIntent) => {
      if (intent.confirmation) {
        const accepted = await confirm({
          title: intent.confirmation.title,
          body: intent.confirmation.body,
          confirmLabel: intent.confirmation.confirmLabel,
          destructive: intent.confirmation.destructive,
        });
        if (!accepted) return;
      }

      const action = intent.action;
      switch (action.kind) {
        case "navigate":
          router.push(action.href);
          return;

        case "openExternal":
          if (!isSafeExternalURL(action.url)) {
            toast({
              title: "That link was not opened",
              body: "Nexus OS only opens plain https web addresses. Edit the item and give it a full https:// address.",
              tone: "critical",
            });
            return;
          }
          window.open(action.url, "_blank", "noopener,noreferrer");
          return;

        case "switchWorkspace": {
          setActiveWorkspaceId(action.workspaceId);
          router.push("/dashboard");
          return;
        }

        case "openPanel":
          openPanel(action.panel);
          return;

        case "openPalette":
          setPaletteOpen(true, action.seed ?? "");
          return;

        case "openHelp":
          openPanel({
            id: `help:${action.topicId}`,
            title: action.title,
            subtitle: "Help",
            content: { kind: "help", topicId: action.topicId },
          });
          return;

        case "applyOperations":
          await applyOperations(action.operations, action.label);
          return;

        case "refreshServices":
          refreshServices();
          toast({ title: "Refreshing", body: "Nexus OS is checking every connected service again.", tone: "info" });
          return;

        case "undo":
          await undo();
          return;

        case "redo":
          await redo();
          return;

        case "bridge": {
          const result = await apiPost<{ ok: boolean; error?: { message: string; recovery: string } }>(
            "/api/bridge/action",
            { action: action.action, parameters: action.parameters },
          );
          if (!result.ok) {
            toast({
              title: `${action.description} did not run`,
              body: `${result.problem.message} ${result.problem.nextStep}`,
              tone: "critical",
              href: result.problem.href ?? "/settings/desktop",
            });
            return;
          }
          if (result.data.ok === false) {
            toast({
              title: `${action.description} did not run`,
              body: `${result.data.error?.message ?? "The Mac Bridge refused that action."} ${
                result.data.error?.recovery ?? "Open Settings › Nexus Desktop to check the connection."
              }`,
              tone: "critical",
              href: "/settings/desktop",
            });
            return;
          }
          toast({ title: `${action.description} — done`, body: "The Mac Bridge carried out the action.", tone: "positive" });
          return;
        }

        case "exitToDesktop": {
          // In the native shell the host app listens for this message and hides
          // the Nexus window. In a browser there is nothing to hide, so say so
          // rather than pretending something happened.
          const host = (window as unknown as { webkit?: { messageHandlers?: Record<string, { postMessage: (value: unknown) => void }> } })
            .webkit?.messageHandlers?.nexusShell;
          if (host) {
            host.postMessage({ type: "exitToDesktop" });
            return;
          }
          toast({
            title: "You are already in a browser",
            body: "Nexus OS is running in a browser tab, so plain macOS is one window away. Inside the Nexus OS app this control hides the Nexus window instead.",
            tone: "info",
            href: "/settings/desktop",
          });
          return;
        }

        case "unsupported":
          toast({
            title: "Nexus OS cannot do that",
            body: `${action.reason} ${action.nextStep}`,
            tone: "caution",
            href: action.href,
          });
          return;
      }
    },
    [confirm, router, toast, openPanel, setPaletteOpen, setActiveWorkspaceId, applyOperations, refreshServices, undo, redo],
  );
}
