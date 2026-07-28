import type { ChangeEvent, ReactNode } from "react";
import { token } from "./tokens.js";

const baseInputStyle = {
  width: "100%",
  background: "var(--nx-surface-sunken)",
  border: `1px solid ${token.border}`,
  borderRadius: token.radiusSmall,
  color: token.textPrimary,
  padding: "6px 8px",
  fontSize: 13,
  fontFamily: "inherit",
} as const;

export function TextInput(props: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
  type?: "text" | "url";
}) {
  return (
    <input
      id={props.id}
      type={props.type ?? "text"}
      value={props.value}
      placeholder={props.placeholder}
      maxLength={props.maxLength}
      aria-invalid={props.invalid ? "true" : undefined}
      onChange={(event: ChangeEvent<HTMLInputElement>) => props.onChange(event.target.value)}
      style={{ ...baseInputStyle, borderColor: props.invalid ? token.danger : token.border }}
    />
  );
}

export function TextArea(props: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  monospace?: boolean;
  invalid?: boolean;
}) {
  return (
    <textarea
      id={props.id}
      value={props.value}
      rows={props.rows ?? 4}
      placeholder={props.placeholder}
      maxLength={props.maxLength}
      aria-invalid={props.invalid ? "true" : undefined}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => props.onChange(event.target.value)}
      style={{
        ...baseInputStyle,
        resize: "vertical",
        lineHeight: 1.5,
        fontFamily: props.monospace ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit",
        borderColor: props.invalid ? token.danger : token.border,
      }}
    />
  );
}

export function NumberInput(props: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        id={props.id}
        type="number"
        value={Number.isFinite(props.value) ? props.value : 0}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const parsed = Number(event.target.value);
          props.onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
        style={{ ...baseInputStyle, width: 120 }}
      />
      {props.unit ? <span style={{ fontSize: 12, color: token.textSecondary }}>{props.unit}</span> : null}
    </span>
  );
}

export function SelectInput(props: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string; help?: string }>;
}) {
  return (
    <select
      id={props.id}
      value={props.value}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onChange(event.target.value)}
      style={{ ...baseInputStyle, cursor: "pointer" }}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function ToggleSwitch(props: { id?: string; value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      id={props.id}
      type="button"
      role="switch"
      aria-checked={props.value}
      aria-label={props.label}
      onClick={() => props.onChange(!props.value)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
        color: token.textPrimary,
        fontSize: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 34,
          height: 20,
          borderRadius: 999,
          background: props.value ? token.accent : token.surfaceSunken,
          border: `1px solid ${props.value ? token.accent : token.border}`,
          position: "relative",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: props.value ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: props.value ? token.accentContrast : token.textSecondary,
          }}
        />
      </span>
      <span>{props.value ? "On" : "Off"}</span>
    </button>
  );
}

export function SliderInput(props: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => props.onChange(Number(event.target.value))}
        style={{ flex: 1, accentColor: token.accent }}
      />
      <output style={{ fontSize: 12, color: token.textSecondary, minWidth: 52, textAlign: "right" }}>
        {props.format ? props.format(props.value) : props.value}
      </output>
    </span>
  );
}

export function ChipGroup(props: {
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string[];
  onChange: (values: string[]) => void;
  legend: string;
}) {
  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
      <legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {props.legend}
      </legend>
      {props.options.map((option) => {
        const active = props.selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() =>
              props.onChange(
                active ? props.selected.filter((value) => value !== option.value) : [...props.selected, option.value],
              )
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              border: `1px solid ${active ? token.accent : token.border}`,
              background: active ? token.accentSoft : "transparent",
              color: active ? token.textPrimary : token.textSecondary,
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <span aria-hidden="true">{active ? "✓" : "＋"}</span>
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

export function InlineNote({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "caution" | "danger" }) {
  const colour = tone === "danger" ? token.danger : tone === "caution" ? token.warning : token.textMuted;
  return <span style={{ fontSize: 11, color: colour, lineHeight: 1.45 }}>{children}</span>;
}
