"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { PropertyDefinition } from "@nexus/schemas";

/**
 * The pieces every inspector control shares.
 *
 * There is exactly one control component per property *kind*, never per widget.
 * A control therefore only ever sees a `PropertyDefinition` and a value, which is
 * what makes adding a widget type a zero-change event for this folder.
 */

export interface ControlProps<Definition extends PropertyDefinition = PropertyDefinition> {
  /** Stable id so the label's `for` and the control agree. */
  id: string;
  definition: Definition;
  value: unknown;
  onChange: (value: unknown) => void;
  /** True while the change is being saved, so a control can stay responsive. */
  disabled?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Field chrome                                                                */
/* -------------------------------------------------------------------------- */

export function StudioField({
  id,
  label,
  help,
  advanced,
  caution,
  problem,
  children,
}: {
  id?: string;
  label: string;
  help?: string;
  advanced?: boolean;
  caution?: string | null;
  problem?: string | null;
  children: ReactNode;
}) {
  const describedBy = [help ? `${id}-help` : null, caution ? `${id}-caution` : null, problem ? `${id}-problem` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="nx-field nx-studio-field" data-advanced={advanced ? "true" : undefined}>
      <label className="nx-field__label" htmlFor={id}>
        {label}
        {advanced ? <span className="nx-studio-tag">Advanced</span> : null}
      </label>
      <div className="nx-studio-field__control" aria-describedby={describedBy || undefined}>
        {children}
      </div>
      {help ? (
        <p className="nx-field__help" id={id ? `${id}-help` : undefined}>
          {help}
        </p>
      ) : null}
      {caution ? (
        <p className="nx-studio-caution" id={id ? `${id}-caution` : undefined}>
          <span aria-hidden="true">▲</span> {caution}
        </p>
      ) : null}
      {problem ? (
        <p className="nx-field__error" role="alert" id={id ? `${id}-problem` : undefined}>
          <span aria-hidden="true">▲</span> {problem}
        </p>
      ) : null}
    </div>
  );
}

/** A labelled group of radio-style choices, used by the image and audio controls. */
export function ChoiceRow({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="nx-segmented" role="radiogroup" aria-label={legend}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className="nx-segmented__option"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Typing without losing keystrokes                                            */
/* -------------------------------------------------------------------------- */

/**
 * Text edits autosave, but committing on every keystroke would send one
 * transaction per letter. This keeps the field responsive locally and commits
 * once the typing pauses, on blur, or on Enter — and never discards what the
 * person typed if the save has not come back yet.
 */
export function useTextBuffer(
  value: string,
  commit: (next: string) => void,
  delayMs = 450,
): {
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
} {
  const [local, setLocal] = useState(value);
  const inFlight = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (inFlight.current === null) {
      setLocal(value);
      return;
    }
    // Once the document echoes what was sent, the field is in sync again.
    if (inFlight.current === value) inFlight.current = null;
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const flush = useCallback(
    (next: string) => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      inFlight.current = next;
      commit(next);
    },
    [commit],
  );

  const onChange = useCallback(
    (next: string) => {
      setLocal(next);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(next), delayMs);
    },
    [delayMs, flush],
  );

  const onBlur = useCallback(() => {
    if (timer.current !== null) flush(local);
  }, [flush, local]);

  const onKeyDown = useCallback(
    (event: { key: string; preventDefault: () => void }) => {
      if (event.key === "Enter") {
        event.preventDefault();
        flush(local);
      }
    },
    [flush, local],
  );

  return { value: local, onChange, onBlur, onKeyDown };
}
