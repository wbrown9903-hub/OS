"use client";

import Link from "next/link";
import type { ActionValue } from "@nexus/schemas";
import { useShell } from "../../../lib/client/shell-store";
import {
  actionProblem,
  describeAction,
  readAction,
  readLink,
  readString,
} from "../studio-model";
import { StudioField, useTextBuffer, type ControlProps } from "./common";

/**
 * One component per property kind — part three: the kinds that make something
 * happen.
 *
 * Authority comes from provenance, never from content, so nothing here can be
 * turned into arbitrary behaviour by typing into it. An action is always chosen
 * from the fixed vocabulary in `actionSchema`; there is deliberately no field
 * anywhere in Nexus Studio that accepts a command line.
 */

/* --- link ----------------------------------------------------------------- */

const OPEN_IN = [
  { value: "browser", label: "Your browser" },
  { value: "panel", label: "A panel inside Nexus OS" },
  { value: "desktopApp", label: "The matching Mac app, if installed" },
];

export function LinkControl({ id, definition, value, onChange }: ControlProps) {
  const link = readLink(value);
  const update = (patch: Partial<typeof link>) => onChange({ ...link, ...patch });
  const urlBuffer = useTextBuffer(link.url, (next) => update({ url: next.trim() }));
  const labelBuffer = useTextBuffer(link.label, (next) => update({ label: next }));

  const problem =
    link.url && !/^(https:\/\/|\/)/i.test(link.url)
      ? "Enter a full https:// address, or an address inside Nexus OS starting with /."
      : null;
  const caution =
    link.url && !link.label ? "This link has no words on it, so the address itself will be shown." : null;

  return (
    <StudioField id={id} label={definition.label} help={definition.help} advanced={definition.advanced} problem={problem} caution={caution}>
      <input
        id={id}
        className="nx-input"
        type="url"
        placeholder="https://"
        value={urlBuffer.value}
        aria-label={`${definition.label} — address`}
        onChange={(event) => urlBuffer.onChange(event.target.value)}
        onBlur={urlBuffer.onBlur}
        onKeyDown={urlBuffer.onKeyDown}
      />
      <input
        className="nx-input"
        type="text"
        placeholder="Words shown on the link"
        value={labelBuffer.value}
        aria-label={`${definition.label} — label`}
        onChange={(event) => labelBuffer.onChange(event.target.value)}
        onBlur={labelBuffer.onBlur}
        onKeyDown={labelBuffer.onKeyDown}
      />
      <select
        className="nx-select"
        value={link.openIn}
        aria-label={`${definition.label} — where it opens`}
        onChange={(event) => update({ openIn: event.target.value as typeof link.openIn })}
      >
        {OPEN_IN.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </StudioField>
  );
}

/* --- action --------------------------------------------------------------- */

/** The complete vocabulary, worded for a person rather than for a developer. */
const ACTION_TYPES: Array<{ value: ActionValue["type"]; label: string }> = [
  { value: "none", label: "Nothing" },
  { value: "openURL", label: "Open a web address" },
  { value: "launchApplication", label: "Open an app on this Mac" },
  { value: "openFile", label: "Open a file" },
  { value: "openFolder", label: "Reveal a folder" },
  { value: "openPanel", label: "Open a panel inside Nexus OS" },
  { value: "switchWorkspace", label: "Switch workspace" },
  { value: "runWorkflow", label: "Open a workflow" },
  { value: "runCommand", label: "Go to a place in Nexus OS" },
  { value: "showTutorial", label: "Show a walkthrough" },
  { value: "invokeMCPTool", label: "Use an MCP tool" },
];

/**
 * The only destinations "Go to a place in Nexus OS" can name. It is a fixed list
 * rather than a text field precisely so that a configuration document — which
 * may have been imported or written by a model — can never name something else.
 */
const INTERNAL_DESTINATIONS = [
  { value: "/", label: "The dashboard" },
  { value: "/studio", label: "Nexus Studio" },
];

const NEEDS_BRIDGE = new Set<ActionValue["type"]>(["launchApplication", "openFile", "openFolder"]);

export function ActionControl({ id, definition, value, onChange }: ControlProps) {
  const shell = useShell();
  const action = readAction(value);
  const update = (patch: Partial<ActionValue>) => onChange({ ...action, ...patch });
  const targetBuffer = useTextBuffer(action.target, (next) => update({ target: next.trim() }));
  const fallbackBuffer = useTextBuffer(action.fallbackURL ?? "", (next) =>
    update({ fallbackURL: next.trim() || null }),
  );

  const applications = shell.document.dock
    .map((item) => item.requiresApplication)
    .filter((name): name is string => Boolean(name));

  const bridgeMissing = NEEDS_BRIDGE.has(action.type) && !shell.bridge.value.available;

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      problem={actionProblem(action)}
      caution={
        bridgeMissing
          ? "Nexus Desktop is not running on this Mac, so this will explain itself instead of acting until the app is open."
          : null
      }
    >
      <select
        id={id}
        className="nx-select"
        value={action.type}
        onChange={(event) => update({ type: event.target.value as ActionValue["type"], target: "" })}
      >
        {ACTION_TYPES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <p className="nx-studio-hint">{describeAction(action)}</p>

      {action.type === "runCommand" ? (
        <select
          className="nx-select"
          aria-label="Where to go"
          value={action.target}
          onChange={(event) => update({ target: event.target.value })}
        >
          <option value="">Choose a destination…</option>
          {INTERNAL_DESTINATIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {action.type === "switchWorkspace" ? (
        <select
          className="nx-select"
          aria-label="Workspace"
          value={action.target}
          onChange={(event) => update({ target: event.target.value })}
        >
          <option value="">Choose a workspace…</option>
          {shell.document.workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.title}
            </option>
          ))}
        </select>
      ) : null}

      {action.type === "showTutorial" ? (
        <select
          className="nx-select"
          aria-label="Walkthrough"
          value={action.target}
          onChange={(event) => update({ target: event.target.value })}
        >
          <option value="">Choose a walkthrough…</option>
          {shell.helpTopics.value.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.title}
            </option>
          ))}
        </select>
      ) : null}

      {action.type === "launchApplication" ? (
        <>
          <input
            className="nx-input"
            list={`${id}-apps`}
            type="text"
            placeholder="Application identifier, e.g. jagex-launcher"
            value={targetBuffer.value}
            aria-label="Application"
            onChange={(event) => targetBuffer.onChange(event.target.value)}
            onBlur={targetBuffer.onBlur}
            onKeyDown={targetBuffer.onKeyDown}
          />
          <datalist id={`${id}-apps`}>
            {applications.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </>
      ) : null}

      {action.type === "openURL" ? (
        <input
          className="nx-input"
          type="url"
          placeholder="https://"
          value={targetBuffer.value}
          aria-label="Web address"
          onChange={(event) => targetBuffer.onChange(event.target.value)}
          onBlur={targetBuffer.onBlur}
          onKeyDown={targetBuffer.onKeyDown}
        />
      ) : null}

      {action.type === "openFile" ||
      action.type === "openFolder" ||
      action.type === "openPanel" ||
      action.type === "runWorkflow" ||
      action.type === "invokeMCPTool" ? (
        <input
          className="nx-input"
          type="text"
          placeholder={
            action.type === "openFile"
              ? "/Users/you/Documents/plan.pdf"
              : action.type === "openFolder"
                ? "/Users/you/Documents"
                : action.type === "openPanel"
                  ? "Panel name, e.g. brain"
                  : action.type === "runWorkflow"
                    ? "Workflow identifier"
                    : "Tool identifier"
          }
          value={targetBuffer.value}
          aria-label="Target"
          onChange={(event) => targetBuffer.onChange(event.target.value)}
          onBlur={targetBuffer.onBlur}
          onKeyDown={targetBuffer.onKeyDown}
        />
      ) : null}

      {action.type !== "none" ? (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={action.confirmationRequired}
            className="nx-switch"
            onClick={() => update({ confirmationRequired: !action.confirmationRequired })}
          >
            <span className="nx-switch__track" aria-hidden="true">
              <span className="nx-switch__thumb" />
            </span>
            <span className="nx-switch__state">Ask me first</span>
          </button>
          <p className="nx-studio-hint">
            Anything that changes something outside Nexus OS is always confirmed, whatever this says.
          </p>

          <label className="nx-field__label" htmlFor={`${id}-fallback`}>
            If that is not possible, open instead
          </label>
          <input
            id={`${id}-fallback`}
            className="nx-input"
            type="url"
            placeholder="https:// (optional)"
            value={fallbackBuffer.value}
            onChange={(event) => fallbackBuffer.onChange(event.target.value)}
            onBlur={fallbackBuffer.onBlur}
            onKeyDown={fallbackBuffer.onKeyDown}
          />
          <p className="nx-studio-hint">
            Used when the app is not installed or Nexus Desktop is not running, so the button still does something
            useful.
          </p>
        </>
      ) : null}
    </StudioField>
  );
}

/* --- connection ----------------------------------------------------------- */

export function ConnectionControl({ id, definition, value, onChange }: ControlProps) {
  const shell = useShell();
  if (definition.kind !== "connection") return null;
  const current = readString(value, "");
  const service = definition.service;

  const candidates = shell.connections.value.filter((connection) => connection.service === service);
  const chosen = candidates.find((connection) => connection.id === current);
  const unusable = chosen && chosen.state !== "connected";

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={
        unusable
          ? `This ${service} connection is not usable right now (${chosen.state}). The widget will explain itself and offer a way to fix it rather than showing nothing.`
          : null
      }
    >
      {candidates.length === 0 ? (
        <p className="nx-studio-hint">
          No {service} connection has been set up yet.{" "}
          <Link href={`/settings/connections/${encodeURIComponent(service)}`}>Connect {service}</Link> and it appears
          here.
        </p>
      ) : (
        <select
          id={id}
          className="nx-select"
          value={current}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">Not connected</option>
          {candidates.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.label} — {connection.state === "connected" ? "connected" : connection.state}
            </option>
          ))}
        </select>
      )}
      {shell.connections.problem ? (
        <p className="nx-studio-hint">
          {shell.connections.problem.message} {shell.connections.problem.nextStep}
        </p>
      ) : null}
    </StudioField>
  );
}
