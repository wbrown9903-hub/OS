"use client";

import { useState, type ReactNode } from "react";
import { defaultsForSchema, type PropertyDefinition } from "@nexus/schemas";
import { readRecordArray, readString } from "../studio-model";
import { StudioField, type ControlProps } from "./common";

/**
 * One component per property kind — the recursive one.
 *
 * A list declares an `itemSchema`, so its rows are drawn by the very same
 * controls as the top level. The renderer is passed in rather than imported so
 * that the dispatcher stays the single place that maps a kind to a component.
 */
export function ListControl({
  id,
  definition,
  value,
  onChange,
  renderProperty,
}: ControlProps & {
  renderProperty: (args: {
    id: string;
    definition: PropertyDefinition;
    value: unknown;
    onChange: (next: unknown) => void;
  }) => ReactNode;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  if (definition.kind !== "list") return null;

  const items = readRecordArray(value);
  const itemSchema = definition.itemSchema;
  const keys = Object.keys(itemSchema);

  const write = (next: Array<Record<string, unknown>>) => onChange(next);

  const describeItem = (item: Record<string, unknown>, index: number): string => {
    for (const key of keys) {
      const entry = itemSchema[key];
      if (!entry) continue;
      if (entry.kind === "text" || entry.kind === "longText") {
        const text = readString(item[key]).trim();
        if (text) return text;
      }
      if (entry.kind === "link") {
        const link = item[key] as { label?: unknown; url?: unknown } | undefined;
        const label = readString(link?.label).trim() || readString(link?.url).trim();
        if (label) return label;
      }
    }
    return `${definition.itemLabel} ${index + 1}`;
  };

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={items.length === 0 ? `No ${definition.itemLabel.toLowerCase()} has been added yet, so this widget has nothing to show.` : null}
    >
      <ul className="nx-studio-list" id={id}>
        {items.map((item, index) => {
          const open = openIndex === index;
          return (
            <li key={index} className="nx-studio-list__item">
              <div className="nx-studio-list__head">
                <button
                  type="button"
                  className="nx-studio-list__toggle"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                  {describeItem(item, index)}
                </button>
                <span className="nx-studio-list__actions">
                  <button
                    type="button"
                    className="nx-button nx-button--ghost nx-button--small"
                    disabled={index === 0}
                    aria-label={`Move ${describeItem(item, index)} up`}
                    onClick={() => {
                      const next = [...items];
                      const [moved] = next.splice(index, 1);
                      next.splice(index - 1, 0, moved ?? {});
                      write(next);
                      setOpenIndex(index - 1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="nx-button nx-button--ghost nx-button--small"
                    disabled={index === items.length - 1}
                    aria-label={`Move ${describeItem(item, index)} down`}
                    onClick={() => {
                      const next = [...items];
                      const [moved] = next.splice(index, 1);
                      next.splice(index + 1, 0, moved ?? {});
                      write(next);
                      setOpenIndex(index + 1);
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="nx-button nx-button--ghost nx-button--small"
                    aria-label={`Remove ${describeItem(item, index)}`}
                    onClick={() => {
                      write(items.filter((_, position) => position !== index));
                      setOpenIndex(null);
                    }}
                  >
                    Remove
                  </button>
                </span>
              </div>

              {open ? (
                <div className="nx-studio-list__body">
                  {keys.map((key) => {
                    const entry = itemSchema[key];
                    if (!entry) return null;
                    return (
                      <div key={key}>
                        {renderProperty({
                          id: `${id}-${index}-${key}`,
                          definition: entry,
                          value: item[key],
                          onChange: (next) =>
                            write(
                              items.map((candidate, position) =>
                                position === index ? { ...candidate, [key]: next } : candidate,
                              ),
                            ),
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="nx-button nx-button--secondary nx-button--small"
        onClick={() => {
          write([...items, defaultsForSchema(itemSchema)]);
          setOpenIndex(items.length);
        }}
      >
        Add {definition.itemLabel.toLowerCase()}
      </button>
    </StudioField>
  );
}
