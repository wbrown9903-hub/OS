"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  freshnessFor,
  moveWidget,
  removeWidget,
  resizeWidget,
  resolvePage,
  type DataFreshness,
  type ResolvedPage,
  type WidgetNode,
} from "@nexus/schemas";
import { useShell } from "../../lib/client/shell-store";
import { rendererFor } from "../widgets/registry";
import { setWidgetField } from "./edits";
import { dropSlotFor, nudgeSlot, snapSpanColumns, snapSpanRows, widgetsInZone } from "./studio-model";
import { useStudio } from "./studio-store";

/**
 * The canvas.
 *
 * It draws the real dashboard through `resolvePage()` — the same function the
 * shell uses — so what is being edited is what will be seen, including the
 * accessibility clamps and the "this is unavailable, here is the next step"
 * cards. Preview mode is the same tree with the editing chrome removed, not a
 * second renderer that could drift.
 */

/** Grid geometry. JavaScript and CSS read these same two numbers. */
const ROW_HEIGHT = 74;
const GRID_GAP = 12;

interface DropTarget {
  zoneId: string;
  index: number;
}

interface ResizeState {
  widgetId: string;
  columns: number;
  rows: number;
}

export function StudioCanvas() {
  const studio = useStudio();
  const shell = useShell();
  const { document: config, page, preview, selectedWidgetId, selectWidget, runEdit } = studio;

  const surface = useRef<HTMLDivElement | null>(null);
  const [surfaceWidth, setSurfaceWidth] = useState(1200);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [resizing, setResizing] = useState<ResizeState | null>(null);

  // The canvas is narrower than the window, so the resolver is asked about the
  // width that is actually being drawn. Otherwise a wide window would promise a
  // 16-column layout inside a 900px canvas.
  useEffect(() => {
    const element = surface.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setSurfaceWidth(Math.round(width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const resolveContext = useMemo(
    () => ({ ...shell.resolveContext, viewportWidth: surfaceWidth }),
    [shell.resolveContext, surfaceWidth],
  );

  const resolved: ResolvedPage | null = useMemo(
    () => (page ? resolvePage(config, page, resolveContext) : null),
    [config, page, resolveContext],
  );

  const finishDrag = useCallback(() => {
    setDragging(null);
    setDropTarget(null);
  }, []);

  const dropWidget = useCallback(
    (widgetId: string, zoneId: string, index: number) => {
      if (!page) return;
      const others = widgetsInZone(page.widgets, zoneId)
        .filter((widget) => widget.id !== widgetId)
        .map((widget) => widget.order);
      const slot = dropSlotFor(others, index);
      void runEdit(
        (document) =>
          moveWidget(document, {
            pageId: page.id,
            widgetId,
            toZoneId: zoneId,
            beforeOrder: slot.beforeOrder,
            afterOrder: slot.afterOrder,
          }),
        "Move panel",
      );
      finishDrag();
    },
    [finishDrag, page, runEdit],
  );

  if (!page || !resolved) {
    return (
      <div className="nx-studio-empty" role="status">
        <h2>This layout has no pages</h2>
        <p>Choose “Add page” above to create one. Every panel lives on a page.</p>
      </div>
    );
  }

  const pageId = page.id;

  return (
    <div
      ref={surface}
      className="nx-studio-surface"
      data-preview={preview ? "true" : undefined}
      style={
        {
          "--nx-studio-row": `${ROW_HEIGHT}px`,
          "--nx-studio-gap": `${GRID_GAP}px`,
        } as React.CSSProperties
      }
      onClick={(event) => {
        if (!preview && event.target === event.currentTarget) selectWidget(null);
      }}
    >
      {resolved.zones.map((zone) => {
        const hiddenHere = preview
          ? []
          : page.widgets.filter((widget) => widget.zone === zone.zone.id && widget.visibility.hidden);

        return (
          <section
            key={zone.zone.id}
            className="nx-studio-zone"
            aria-label={zone.zone.label}
            data-drop={dropTarget?.zoneId === zone.zone.id ? "true" : undefined}
          >
            {preview ? null : (
              <header className="nx-studio-zone__head">
                <h3>{zone.zone.label}</h3>
                <span className="nx-studio-zone__meta">
                  {zone.widgets.length} shown
                  {hiddenHere.length > 0 ? ` · ${hiddenHere.length} hidden` : ""} · {zone.columns} columns here
                </span>
              </header>
            )}

            <ul
              className="nx-studio-grid"
              data-layout={zone.layout}
              style={{ ["--nx-zone-columns" as string]: String(zone.columns) }}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const index = indexFromPointer(event.currentTarget, event.clientX, event.clientY);
                setDropTarget({ zoneId: zone.zone.id, index });
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setDropTarget((current) => (current?.zoneId === zone.zone.id ? null : current));
              }}
              onDrop={(event) => {
                event.preventDefault();
                const widgetId = event.dataTransfer.getData("application/x-nexus-widget") || dragging;
                if (!widgetId) return;
                const index = indexFromPointer(event.currentTarget, event.clientX, event.clientY);
                dropWidget(widgetId, zone.zone.id, index);
              }}
            >
              {zone.widgets.map((item, index) => (
                <WidgetSlot
                  key={item.node.id}
                  node={item.node}
                  columns={Math.min(item.columns, zone.columns)}
                  rows={item.rows}
                  zoneColumns={zone.columns}
                  unavailable={item.unavailable}
                  selected={selectedWidgetId === item.node.id}
                  preview={preview}
                  dragging={dragging === item.node.id}
                  dropBefore={dropTarget?.zoneId === zone.zone.id && dropTarget.index === index}
                  resizingTo={resizing?.widgetId === item.node.id ? resizing : null}
                  onSelect={() => selectWidget(item.node.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/x-nexus-widget", item.node.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDragging(item.node.id);
                  }}
                  onDragEnd={finishDrag}
                  onResizeStart={(event) => {
                    const grid = event.currentTarget.closest(".nx-studio-grid");
                    const slot = event.currentTarget.closest(".nx-studio-slot");
                    if (!(grid instanceof HTMLElement) || !(slot instanceof HTMLElement)) return;
                    const gridWidth = grid.getBoundingClientRect().width;
                    const startRect = slot.getBoundingClientRect();
                    const startX = event.clientX;
                    const startY = event.clientY;
                    event.currentTarget.setPointerCapture(event.pointerId);

                    const move = (moveEvent: PointerEvent) => {
                      const width = startRect.width + (moveEvent.clientX - startX);
                      const height = startRect.height + (moveEvent.clientY - startY);
                      setResizing({
                        widgetId: item.node.id,
                        columns: snapSpanColumns(width, gridWidth, zone.columns),
                        rows: snapSpanRows(height, ROW_HEIGHT, GRID_GAP),
                      });
                    };

                    const up = () => {
                      window.removeEventListener("pointermove", move);
                      window.removeEventListener("pointerup", up);
                      setResizing((current) => {
                        if (
                          current &&
                          current.widgetId === item.node.id &&
                          (current.columns !== item.node.span.columns || current.rows !== item.node.span.rows)
                        ) {
                          void runEdit(
                            (document) =>
                              resizeWidget(document, pageId, item.node.id, {
                                columns: current.columns,
                                rows: current.rows,
                              }),
                            "Resize panel",
                          );
                        }
                        return null;
                      });
                    };

                    window.addEventListener("pointermove", move);
                    window.addEventListener("pointerup", up);
                  }}
                  onKeyCommand={(command) => handleKeyCommand(command, item.node)}
                />
              ))}

              {dropTarget?.zoneId === zone.zone.id && dropTarget.index >= zone.widgets.length ? (
                <li className="nx-studio-dropline nx-studio-dropline--end" aria-hidden="true" />
              ) : null}

              {zone.widgets.length === 0 && hiddenHere.length === 0 ? (
                <li className="nx-studio-zone__empty">
                  {preview
                    ? `Nothing in ${zone.zone.label} yet.`
                    : `Nothing in ${zone.zone.label} yet. Choose “Add panel”, or drag one here.`}
                </li>
              ) : null}
            </ul>

            {hiddenHere.length > 0 ? (
              <ul className="nx-studio-hidden">
                {hiddenHere.map((widget) => (
                  <li key={widget.id}>
                    <button
                      type="button"
                      className="nx-studio-hidden__chip"
                      onClick={() => selectWidget(widget.id)}
                    >
                      <span aria-hidden="true">◇</span> {studio.definitionFor(widget.type)?.name ?? widget.type} —
                      hidden
                    </button>
                    <button
                      type="button"
                      className="nx-button nx-button--ghost nx-button--small"
                      onClick={() =>
                        void runEdit(
                          (document) =>
                            setWidgetField(document, pageId, widget.id, "visibility", {
                              ...widget.visibility,
                              hidden: false,
                            }, "Show panel again"),
                          "Show panel again",
                        )
                      }
                    >
                      Show again
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );

  /** Keyboard equivalents for every pointer gesture on the canvas. */
  function handleKeyCommand(command: KeyCommand, node: WidgetNode) {
    if (!page) return;
    switch (command.kind) {
      case "nudge": {
        const slot = nudgeSlot(page.widgets, node.zone, node.id, command.direction);
        if (!slot) return;
        void runEdit(
          (document) =>
            moveWidget(document, {
              pageId: page.id,
              widgetId: node.id,
              toZoneId: node.zone,
              beforeOrder: slot.beforeOrder,
              afterOrder: slot.afterOrder,
            }),
          command.direction === -1 ? "Move panel earlier" : "Move panel later",
        );
        return;
      }
      case "zone": {
        const zones = page.zones;
        const current = zones.findIndex((zone) => zone.id === node.zone);
        const next = zones[current + command.direction];
        if (!next) return;
        void runEdit(
          (document) =>
            moveWidget(document, {
              pageId: page.id,
              widgetId: node.id,
              toZoneId: next.id,
              beforeOrder: null,
              afterOrder: null,
            }),
          `Move panel to ${next.label}`,
        );
        return;
      }
      case "resize": {
        void runEdit(
          (document) =>
            resizeWidget(document, page.id, node.id, {
              columns: node.span.columns + command.columns,
              rows: node.span.rows + command.rows,
            }),
          "Resize panel",
        );
        return;
      }
      case "delete": {
        void shell
          .confirm({
            title: "Delete this panel?",
            body: "It is removed from the page along with its settings. Undo brings it straight back.",
            confirmLabel: "Delete panel",
            destructive: true,
          })
          .then((accepted) => {
            if (!accepted) return;
            selectWidget(null);
            void runEdit((document) => removeWidget(document, page.id, node.id));
          });
        return;
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* One slot                                                                    */
/* -------------------------------------------------------------------------- */

type KeyCommand =
  | { kind: "nudge"; direction: -1 | 1 }
  | { kind: "zone"; direction: -1 | 1 }
  | { kind: "resize"; columns: number; rows: number }
  | { kind: "delete" };

function WidgetSlot(props: {
  node: WidgetNode;
  columns: number;
  rows: number;
  zoneColumns: number;
  unavailable: { summary: string; nextStep: string } | null;
  selected: boolean;
  preview: boolean;
  dragging: boolean;
  dropBefore: boolean;
  resizingTo: ResizeState | null;
  onSelect: () => void;
  onDragStart: (event: React.DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyCommand: (command: KeyCommand) => void;
}) {
  const studio = useStudio();
  const definition = studio.definitionFor(props.node.type);
  const Renderer = rendererFor(props.node.type);
  const name = definition?.name ?? props.node.type;

  const freshness: DataFreshness = props.unavailable
    ? { state: "unavailable", reason: props.unavailable.summary, nextStep: props.unavailable.nextStep }
    : definition?.requiresConnection
      ? { state: "notConfigured", nextStep: "Connect this service to see live information." }
      : freshnessFor(new Date(), props.node.refreshSeconds);

  const displayColumns = props.resizingTo
    ? Math.max(1, Math.round((props.resizingTo.columns / 12) * props.zoneColumns))
    : props.columns;
  const displayRows = props.resizingTo ? props.resizingTo.rows : props.rows;

  return (
    <li
      className="nx-studio-slot"
      data-selected={props.selected ? "true" : undefined}
      data-dragging={props.dragging ? "true" : undefined}
      data-dropbefore={props.dropBefore ? "true" : undefined}
      data-widget-id={props.node.id}
      draggable={!props.preview}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      style={{
        gridColumn: `span ${Math.min(displayColumns, props.zoneColumns)}`,
        gridRow: `span ${displayRows}`,
      }}
    >
      <div className="nx-studio-slot__content" aria-hidden={!props.preview}>
        <Renderer
          node={props.node}
          settings={props.node.settings}
          data={null}
          freshness={freshness}
          loading={false}
          editing={!props.preview}
        />
      </div>

      {props.preview ? null : (
        <>
          <button
            type="button"
            className="nx-studio-slot__hit"
            aria-pressed={props.selected}
            aria-label={`${name} — ${props.node.span.columns} of 12 columns wide, ${props.node.span.rows} rows tall. Select to edit.`}
            onClick={props.onSelect}
            onFocus={props.onSelect}
            onKeyDown={(event) => {
              const command = commandForKey(event);
              if (!command) return;
              event.preventDefault();
              props.onKeyCommand(command);
            }}
          />
          <span className="nx-studio-slot__label" aria-hidden="true">
            {name}
          </span>
          {props.resizingTo ? (
            <span className="nx-studio-slot__readout" role="status">
              {props.resizingTo.columns} / 12 columns · {props.resizingTo.rows} row
              {props.resizingTo.rows === 1 ? "" : "s"}
            </span>
          ) : null}
          <button
            type="button"
            className="nx-studio-slot__resize"
            aria-label={`Resize ${name}. Use the left and right arrow keys for width and the up and down arrow keys for height.`}
            onPointerDown={props.onResizeStart}
            onKeyDown={(event) => {
              const map: Record<string, KeyCommand> = {
                ArrowLeft: { kind: "resize", columns: -1, rows: 0 },
                ArrowRight: { kind: "resize", columns: 1, rows: 0 },
                ArrowUp: { kind: "resize", columns: 0, rows: -1 },
                ArrowDown: { kind: "resize", columns: 0, rows: 1 },
              };
              const command = map[event.key];
              if (!command) return;
              event.preventDefault();
              props.onKeyCommand(command);
            }}
          />
        </>
      )}
    </li>
  );
}

/** The canvas keyboard map, kept beside the slot it applies to. */
function commandForKey(event: React.KeyboardEvent): KeyCommand | null {
  if (event.key === "Delete" || event.key === "Backspace") return { kind: "delete" };
  if (event.altKey && event.key === "ArrowUp") return { kind: "zone", direction: -1 };
  if (event.altKey && event.key === "ArrowDown") return { kind: "zone", direction: 1 };
  if (event.shiftKey && event.key === "ArrowUp") return { kind: "resize", columns: 0, rows: -1 };
  if (event.shiftKey && event.key === "ArrowDown") return { kind: "resize", columns: 0, rows: 1 };
  if (event.shiftKey && event.key === "ArrowLeft") return { kind: "resize", columns: -1, rows: 0 };
  if (event.shiftKey && event.key === "ArrowRight") return { kind: "resize", columns: 1, rows: 0 };
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") return { kind: "nudge", direction: -1 };
  if (event.key === "ArrowDown" || event.key === "ArrowRight") return { kind: "nudge", direction: 1 };
  return null;
}

/* -------------------------------------------------------------------------- */
/* Where a drop lands                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Reading the real rectangles is what makes a drop land where the pointer looks
 * like it will, whatever the zone's layout or the display's column count.
 */
function indexFromPointer(grid: HTMLElement, clientX: number, clientY: number): number {
  const slots = [...grid.querySelectorAll<HTMLElement>("[data-widget-id]")];
  for (let index = 0; index < slots.length; index += 1) {
    const rect = slots[index]!.getBoundingClientRect();
    if (clientY < rect.top) return index;
    if (clientY <= rect.bottom && clientX < rect.left + rect.width / 2) return index;
  }
  return slots.length;
}
