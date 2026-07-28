"use client";

import { useMemo } from "react";
import {
  commit,
  duplicateWidget,
  inspectorGroups,
  removeWidget,
  resetWidget,
  setWidgetSetting,
  type Operation,
  type Path,
  type PropertyDefinition,
  type WidgetNode,
} from "@nexus/schemas";
import { useShell } from "../../lib/client/shell-store";
import { Icon } from "../shell/Icon";
import { PropertyControl } from "./controls/PropertyControl";
import { setPageField } from "./edits";
import {
  NODE_FIELD_PATHS,
  layoutSchema,
  nodeFieldFromStored,
  nodeFieldToStored,
} from "./node-schema";
import { applyVisibleWhen } from "./studio-model";
import { useStudio } from "./studio-store";

/**
 * The inspector.
 *
 * Every field on this panel is derived from a `PropertySchema` — the widget's own
 * for its settings, and a shared one for the node fields every widget has. There
 * is no branch anywhere in this file on a widget type, and adding a widget
 * requires no change here at all.
 */
export function StudioInspector() {
  const studio = useStudio();
  const shell = useShell();
  const { page, selectedWidget, definitionFor, inspectorMode, runEdit } = studio;

  if (!page) {
    return (
      <div className="nx-studio-empty">
        <h2>No page yet</h2>
        <p>This layout has no pages. Use “Add page” above to make one, then add panels to it.</p>
      </div>
    );
  }

  if (!selectedWidget) {
    return <PageInspector />;
  }

  const definition = definitionFor(selectedWidget.type);
  const pageId = page.id;
  const widget = selectedWidget;

  const setSetting = (key: string, value: unknown) => {
    void runEdit(
      (document) => setWidgetSetting(document, pageId, widget.id, key, value),
      `Change ${definition?.name ?? widget.type} · ${key}`,
    );
  };

  const setNodeField = (key: string, value: unknown, label: string) => {
    const segments = NODE_FIELD_PATHS[key];
    if (!segments) return;
    const path: Path = ["pages", { id: pageId }, "widgets", { id: widget.id }, ...segments];
    const operations: Operation[] = [{ op: "set", path, value: nodeFieldToStored(key, value) }];
    void runEdit((document) => commit(document, operations, { label }), label);
  };

  const schemaGroups = definition
    ? inspectorGroups(definition.schema, inspectorMode).map((group) => ({
        group: group.group,
        properties: applyVisibleWhen(group.properties, widget.settings),
      }))
    : [];

  const nodeSchema = layoutSchema(
    definition,
    page.zones,
    [...new Set(shell.connections.value.map((connection) => connection.service))],
  );
  const nodeGroups = inspectorGroups(nodeSchema, inspectorMode);

  return (
    <div className="nx-studio-inspector">
      <header className="nx-studio-inspector__head">
        <span className="nx-studio-inspector__icon" aria-hidden="true">
          <Icon name={definition?.icon ?? "square.stack"} size={18} />
        </span>
        <div>
          <h2>{definition?.name ?? widget.type}</h2>
          <p>{definition?.summary ?? "This widget type is not available in this build."}</p>
        </div>
      </header>

      {!definition ? (
        <p className="nx-state nx-state--notice">
          Nothing in this build knows how to draw “{widget.type}”, so its settings cannot be shown. Update Nexus OS, or
          delete the panel below. Its settings are kept until you do.
        </p>
      ) : null}

      <div className="nx-studio-inspector__actions">
        <button
          type="button"
          className="nx-button nx-button--secondary nx-button--small"
          onClick={() => void runEdit((document) => duplicateWidget(document, pageId, widget.id))}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="nx-button nx-button--secondary nx-button--small"
          disabled={!definition}
          onClick={async () => {
            if (!definition) return;
            const accepted = await shell.confirm({
              title: `Reset ${definition.name} to its defaults?`,
              body: "Every setting on this panel goes back to how it arrived. Its position and size are kept. You can undo this straight afterwards.",
              confirmLabel: "Reset panel",
            });
            if (!accepted) return;
            void runEdit((document) => resetWidget(document, pageId, widget.id, definition.schema));
          }}
        >
          Reset this panel
        </button>
        <button
          type="button"
          className="nx-button nx-button--danger nx-button--small"
          onClick={async () => {
            const accepted = await shell.confirm({
              title: "Delete this panel?",
              body: "It is removed from the page along with its settings. Undo brings it straight back.",
              confirmLabel: "Delete panel",
              destructive: true,
            });
            if (!accepted) return;
            studio.selectWidget(null);
            void runEdit((document) => removeWidget(document, pageId, widget.id));
          }}
        >
          Delete
        </button>
      </div>

      {schemaGroups.map((group) =>
        group.properties.length === 0 ? null : (
          <details key={group.group} className="nx-studio-group" open>
            <summary>{group.group}</summary>
            <div className="nx-studio-group__body">
              {group.properties.map(({ key, definition: property }) => (
                <PropertyControl
                  key={`${widget.id}:${key}`}
                  id={`prop-${widget.id}-${key}`}
                  definition={property}
                  value={widget.settings[key]}
                  onChange={(next) => setSetting(key, next)}
                />
              ))}
            </div>
          </details>
        ),
      )}

      {nodeGroups.map((group) => (
        <details key={group.group} className="nx-studio-group">
          <summary>{group.group}</summary>
          <div className="nx-studio-group__body">
            {group.properties.map(({ key, definition: property }) => (
              <PropertyControl
                key={`${widget.id}:node:${key}`}
                id={`node-${widget.id}-${key}`}
                definition={property}
                value={nodeFieldFromStored(key, readNodeField(widget, key))}
                onChange={(next) => setNodeField(key, next, `Change ${property.label.toLowerCase()}`)}
              />
            ))}
            {group.group === "Visibility" ? <ScheduleField widget={widget} pageId={pageId} /> : null}
          </div>
        </details>
      ))}
    </div>
  );
}

function readNodeField(widget: WidgetNode, key: string): unknown {
  const segments = NODE_FIELD_PATHS[key];
  if (!segments) return undefined;
  let current: unknown = widget;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/* -------------------------------------------------------------------------- */
/* Scheduled hours                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `hours` is the one node field that is an object rather than a scalar, so it
 * gets a small block of its own rather than being forced through a control kind
 * that does not fit.
 */
function ScheduleField({ widget, pageId }: { widget: WidgetNode; pageId: string }) {
  const { runEdit } = useStudio();
  const hours = widget.visibility.hours;

  const write = (value: { from: number; to: number } | null) => {
    const path: Path = ["pages", { id: pageId }, "widgets", { id: widget.id }, "visibility", "hours"];
    void runEdit(
      (document) => commit(document, [{ op: "set", path, value }], { label: "Change when this appears" }),
      "Change when this appears",
    );
  };

  return (
    <div className="nx-field nx-studio-field">
      <span className="nx-field__label" id={`hours-${widget.id}`}>
        Only show at certain times
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={hours !== null}
        aria-labelledby={`hours-${widget.id}`}
        className="nx-switch"
        onClick={() => write(hours ? null : { from: 9, to: 18 })}
      >
        <span className="nx-switch__track" aria-hidden="true">
          <span className="nx-switch__thumb" />
        </span>
        <span className="nx-switch__state">{hours ? "On" : "Off"}</span>
      </button>
      {hours ? (
        <span className="nx-studio-inline">
          <label htmlFor={`hours-from-${widget.id}`}>From</label>
          <input
            id={`hours-from-${widget.id}`}
            className="nx-input nx-studio-number"
            type="number"
            min={0}
            max={23}
            value={hours.from}
            onChange={(event) => write({ from: Number(event.target.value), to: hours.to })}
          />
          <label htmlFor={`hours-to-${widget.id}`}>to</label>
          <input
            id={`hours-to-${widget.id}`}
            className="nx-input nx-studio-number"
            type="number"
            min={0}
            max={23}
            value={hours.to}
            onChange={(event) => write({ from: hours.from, to: Number(event.target.value) })}
          />
        </span>
      ) : null}
      <p className="nx-field__help">
        Outside these hours the panel explains that it is outside its scheduled time rather than vanishing. Times may
        wrap past midnight, for example 22 to 7.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page settings — shown when nothing is selected                              */
/* -------------------------------------------------------------------------- */

function PageInspector() {
  const studio = useStudio();
  const shell = useShell();
  const { page, runEdit } = studio;
  if (!page) return null;

  const pageSchema = useMemo<Record<string, PropertyDefinition>>(
    () => ({
      title: {
        kind: "text",
        label: "Page name",
        help: "Shown on the tab at the top of Nexus Studio and in the dashboard's navigation.",
        defaultValue: page.title,
        maxLength: 60,
        group: "Content",
      },
      icon: {
        kind: "icon",
        label: "Page icon",
        help: "Drawn beside the page name.",
        defaultValue: page.icon,
        group: "Appearance",
      },
      showInNavigation: {
        kind: "toggle",
        label: "List in navigation",
        help: "Turn this off for a page you reach only from a link or a shortcut.",
        defaultValue: page.showInNavigation,
        group: "Behaviour",
      },
    }),
    [page.icon, page.showInNavigation, page.title],
  );

  return (
    <div className="nx-studio-inspector">
      <header className="nx-studio-inspector__head">
        <span className="nx-studio-inspector__icon" aria-hidden="true">
          <Icon name={page.icon} size={18} />
        </span>
        <div>
          <h2>{page.title}</h2>
          <p>
            {page.widgets.length} panel{page.widgets.length === 1 ? "" : "s"} across {page.zones.length} area
            {page.zones.length === 1 ? "" : "s"}. Choose a panel on the canvas to edit it.
          </p>
        </div>
      </header>

      <div className="nx-studio-group__body">
        {(["title", "icon", "showInNavigation"] as const).map((key) => {
          const definition = pageSchema[key];
          if (!definition) return null;
          return (
            <PropertyControl
              key={`${page.id}:${key}`}
              id={`page-${page.id}-${key}`}
              definition={definition}
              value={page[key]}
              onChange={(next) =>
                void runEdit(
                  (document) =>
                    setPageField(
                      document,
                      page.id,
                      key,
                      next as never,
                      `Change page ${definition.label.toLowerCase()}`,
                    ),
                  `Change page ${definition.label.toLowerCase()}`,
                )
              }
            />
          );
        })}
      </div>

      <details className="nx-studio-group">
        <summary>Areas on this page</summary>
        <div className="nx-studio-group__body">
          <ul className="nx-studio-zonelist">
            {page.zones.map((zone) => (
              <li key={zone.id}>
                <strong>{zone.label}</strong>
                <span>
                  {page.widgets.filter((widget) => widget.zone === zone.id).length} panels · {zone.layout} layout
                </span>
              </li>
            ))}
          </ul>
          <p className="nx-field__help">
            Areas are laid out separately, so a panel dragged from one to another keeps its size but changes where it
            appears. Areas themselves come from the layout template.
          </p>
        </div>
      </details>

      <p className="nx-field__help">
        {shell.documentSource === "server"
          ? "This layout is saved on this Mac."
          : "This layout has not been read from the server yet, so changes are only active in this window."}
      </p>
    </div>
  );
}
