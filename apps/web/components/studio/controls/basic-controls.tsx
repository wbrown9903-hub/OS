"use client";

import { useState } from "react";
import { Icon, hasIcon } from "../../shell/Icon";
import {
  clamp,
  describeShortcut,
  formatSeconds,
  formatShortcut,
  readBoolean,
  readNumber,
  readString,
  readStringArray,
} from "../studio-model";
import { ChoiceRow, StudioField, useTextBuffer, type ControlProps } from "./common";

/**
 * One component per property kind — part one: the plain value kinds.
 *
 * None of these knows which widget it is editing. They receive a declaration and
 * a value, which is the whole reason a new widget needs no inspector work.
 */

/* --- text ----------------------------------------------------------------- */

export function TextControl({ id, definition, value, onChange }: ControlProps) {
  const maxLength = definition.kind === "text" ? definition.maxLength : undefined;
  const placeholder = definition.kind === "text" ? definition.placeholder : undefined;
  const buffer = useTextBuffer(readString(value), (next) => onChange(next));
  const remaining = maxLength ? maxLength - buffer.value.length : null;

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={remaining !== null && remaining <= 5 ? `${remaining} characters left.` : null}
    >
      <input
        id={id}
        className="nx-input"
        type="text"
        value={buffer.value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => buffer.onChange(event.target.value)}
        onBlur={buffer.onBlur}
        onKeyDown={buffer.onKeyDown}
      />
    </StudioField>
  );
}

/* --- longText ------------------------------------------------------------- */

export function LongTextControl({ id, definition, value, onChange }: ControlProps) {
  const maxLength = definition.kind === "longText" ? definition.maxLength : undefined;
  const placeholder = definition.kind === "longText" ? definition.placeholder : undefined;
  const buffer = useTextBuffer(readString(value), (next) => onChange(next));

  return (
    <StudioField id={id} label={definition.label} help={definition.help} advanced={definition.advanced}>
      <textarea
        id={id}
        className="nx-textarea"
        rows={5}
        value={buffer.value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => buffer.onChange(event.target.value)}
        onBlur={buffer.onBlur}
      />
    </StudioField>
  );
}

/* --- number --------------------------------------------------------------- */

export function NumberControl({ id, definition, value, onChange }: ControlProps) {
  if (definition.kind !== "number") return null;
  const current = readNumber(value, definition.defaultValue);
  const problem =
    (definition.min !== undefined && current < definition.min) ||
    (definition.max !== undefined && current > definition.max)
      ? `Enter a number between ${definition.min ?? "any"} and ${definition.max ?? "any"}.`
      : null;

  return (
    <StudioField id={id} label={definition.label} help={definition.help} advanced={definition.advanced} problem={problem}>
      <span className="nx-studio-inline">
        <input
          id={id}
          className="nx-input nx-studio-number"
          type="number"
          value={current}
          min={definition.min}
          max={definition.max}
          step={definition.step ?? 1}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onChange(Number.isFinite(parsed) ? parsed : definition.defaultValue);
          }}
        />
        {definition.unit ? <span className="nx-studio-unit">{definition.unit}</span> : null}
      </span>
    </StudioField>
  );
}

/* --- toggle --------------------------------------------------------------- */

export function ToggleControl({ id, definition, value, onChange }: ControlProps) {
  const current = readBoolean(value, definition.kind === "toggle" ? definition.defaultValue : false);
  return (
    <StudioField label={definition.label} help={definition.help} advanced={definition.advanced} id={id}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={current}
        className="nx-switch"
        onClick={() => onChange(!current)}
      >
        <span className="nx-switch__track" aria-hidden="true">
          <span className="nx-switch__thumb" />
        </span>
        <span className="nx-switch__state">{current ? "On" : "Off"}</span>
      </button>
    </StudioField>
  );
}

/* --- select --------------------------------------------------------------- */

export function SelectControl({ id, definition, value, onChange }: ControlProps) {
  if (definition.kind !== "select") return null;
  const current = readString(value, definition.defaultValue);
  const known = definition.options.some((option) => option.value === current);
  const chosen = definition.options.find((option) => option.value === current);

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={
        known
          ? null
          : `“${current}” is not one of the choices this widget offers any more. Pick one below to fix it.`
      }
    >
      <select
        id={id}
        className="nx-select"
        value={known ? current : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {known ? null : <option value="">Choose…</option>}
        {definition.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {chosen?.help ? <p className="nx-studio-hint">{chosen.help}</p> : null}
    </StudioField>
  );
}

/* --- multiSelect ---------------------------------------------------------- */

export function MultiSelectControl({ id, definition, value, onChange }: ControlProps) {
  if (definition.kind !== "multiSelect") return null;
  const selected = readStringArray(value);

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={selected.length === 0 ? "Nothing is selected, so this widget will have nothing to show." : null}
    >
      <fieldset className="nx-studio-chips">
        <legend className="nx-sr-only">{definition.label}</legend>
        {definition.options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={active}
              className="nx-studio-chip"
              onClick={() =>
                onChange(
                  active
                    ? selected.filter((entry) => entry !== option.value)
                    : [...selected, option.value],
                )
              }
            >
              <span aria-hidden="true">{active ? "✓" : "＋"}</span>
              {option.label}
            </button>
          );
        })}
      </fieldset>
    </StudioField>
  );
}

/* --- slider --------------------------------------------------------------- */

export function SliderControl({ id, definition, value, onChange }: ControlProps) {
  if (definition.kind !== "slider") return null;
  const current = clamp(readNumber(value, definition.defaultValue), definition.min, definition.max);
  const step = definition.step ?? (definition.max - definition.min <= 4 ? 0.1 : 1);

  return (
    <StudioField id={id} label={definition.label} help={definition.help} advanced={definition.advanced}>
      <span className="nx-studio-inline">
        <input
          id={id}
          className="nx-slider"
          type="range"
          min={definition.min}
          max={definition.max}
          step={step}
          value={current}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output className="nx-studio-output" htmlFor={id}>
          {Number.isInteger(step) ? current : current.toFixed(2)}
        </output>
      </span>
    </StudioField>
  );
}

/* --- duration ------------------------------------------------------------- */

const DURATION_PRESETS = [0, 30, 60, 300, 900, 1800, 3600, 21600, 86400];

export function DurationControl({ id, definition, value, onChange }: ControlProps) {
  if (definition.kind !== "duration") return null;
  const current = readNumber(value, definition.defaultValue);
  const minimum = definition.min ?? 0;
  const maximum = definition.max ?? 86400;
  const presets = DURATION_PRESETS.filter((seconds) => seconds >= minimum && seconds <= maximum);
  const known = presets.includes(current);

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={
        current > 0 && current < 60
          ? "Refreshing more than once a minute uses noticeably more battery and can hit a service's request limits."
          : null
      }
    >
      <select
        id={id}
        className="nx-select"
        value={known ? String(current) : "custom"}
        onChange={(event) => {
          if (event.target.value === "custom") return;
          onChange(Number(event.target.value));
        }}
      >
        {known ? null : <option value="custom">{formatSeconds(current)} (set by hand)</option>}
        {presets.map((seconds) => (
          <option key={seconds} value={seconds}>
            {formatSeconds(seconds)}
          </option>
        ))}
      </select>
    </StudioField>
  );
}

/* --- url ------------------------------------------------------------------ */

export function UrlControl({ id, definition, value, onChange }: ControlProps) {
  const allowLocal = definition.kind === "url" ? definition.allowLocalNetwork === true : false;
  const buffer = useTextBuffer(readString(value), (next) => onChange(next.trim()));
  const trimmed = buffer.value.trim();
  const problem =
    trimmed.length > 0 && !/^https:\/\//i.test(trimmed)
      ? allowLocal
        ? "Enter a full address. Nexus OS only fetches https addresses, apart from the local network addresses this widget explicitly allows."
        : "Nexus OS only fetches https addresses. Enter one that starts with https://."
      : null;

  return (
    <StudioField id={id} label={definition.label} help={definition.help} advanced={definition.advanced} problem={problem}>
      <input
        id={id}
        className="nx-input"
        type="url"
        inputMode="url"
        placeholder="https://"
        value={buffer.value}
        aria-invalid={problem ? "true" : undefined}
        onChange={(event) => buffer.onChange(event.target.value)}
        onBlur={buffer.onBlur}
        onKeyDown={buffer.onKeyDown}
      />
    </StudioField>
  );
}

/* --- shortcut ------------------------------------------------------------- */

export function ShortcutControl({ id, definition, value, onChange }: ControlProps) {
  const current = readString(value);
  const [recording, setRecording] = useState(false);

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={
        current && !current.includes("+")
          ? "A single key without a modifier will fire while you are using the dashboard. Add Command or Control to be safe."
          : null
      }
    >
      <span className="nx-studio-inline">
        <button
          id={id}
          type="button"
          className={recording ? "nx-button nx-button--primary" : "nx-button nx-button--secondary"}
          aria-pressed={recording}
          onClick={() => setRecording((open) => !open)}
          onKeyDown={(event) => {
            if (!recording) return;
            if (event.key === "Escape") {
              setRecording(false);
              return;
            }
            event.preventDefault();
            const shortcut = formatShortcut(event);
            if (!shortcut) return;
            onChange(shortcut);
            setRecording(false);
          }}
        >
          {recording ? "Press the keys…" : current ? describeShortcut(current) : "Record a shortcut"}
        </button>
        {current ? (
          <button type="button" className="nx-button nx-button--ghost nx-button--small" onClick={() => onChange("")}>
            Clear
          </button>
        ) : null}
      </span>
    </StudioField>
  );
}

/* --- font ----------------------------------------------------------------- */

/** Only faces the renderers actually honour are offered; nothing is decorative. */
const FONT_CHOICES = [
  { value: "system", label: "Match macOS (system)" },
  { value: "mono", label: "Monospaced" },
];

export function FontControl({ id, definition, value, onChange }: ControlProps) {
  const current = readString(value, "system");
  const known = FONT_CHOICES.some((choice) => choice.value === current);

  return (
    <StudioField id={id} label={definition.label} help={definition.help} advanced={definition.advanced}>
      <select id={id} className="nx-select" value={current} onChange={(event) => onChange(event.target.value)}>
        {known ? null : <option value={current}>{current} (set by hand)</option>}
        {FONT_CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      <p className="nx-studio-hint" style={{ fontFamily: current === "mono" ? "var(--nx-font-mono)" : "var(--nx-font-ui)" }}>
        The quick brown fox jumps over the lazy dog — 0123456789
      </p>
    </StudioField>
  );
}

/* --- icon ----------------------------------------------------------------- */

/** The shell's icon vocabulary. `hasIcon` keeps this honest at build time. */
const ICON_CHOICES = [
  "square.grid.2x2",
  "rectangle.3.group",
  "sparkles",
  "brain",
  "cart",
  "gamecontroller",
  "flowchart",
  "puzzlepiece.extension",
  "bitcoinsign.circle",
  "gearshape",
  "questionmark.circle",
  "paintpalette",
  "link",
  "lock.shield",
  "desktopcomputer",
  "arrow.clockwise",
  "lifepreserver",
  "info.circle",
  "bell",
  "magnifyingglass",
  "checklist",
  "wifi",
  "bolt",
  "wand.and.rays",
  "slider.horizontal.3",
  "moon",
  "sun.max",
  "eye",
  "doc.text",
  "clock",
  "person.crop.circle",
  "square.stack",
  "externaldrive",
  "arrow.up.right.square",
].filter((name) => hasIcon(name));

export function IconControl({ id, definition, value, onChange }: ControlProps) {
  const current = readString(value);
  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={current && !hasIcon(current) ? `“${current}” is not an icon this build knows, so a neutral placeholder is drawn instead.` : null}
    >
      <div className="nx-studio-icons" role="radiogroup" aria-label={definition.label} id={id}>
        {ICON_CHOICES.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={current === name}
            aria-label={name}
            title={name}
            className="nx-studio-icon-choice"
            onClick={() => onChange(name)}
          >
            <Icon name={name} size={17} />
          </button>
        ))}
      </div>
    </StudioField>
  );
}
