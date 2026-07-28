"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./Icon";
import type { Tone } from "@/lib/client/format";

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "small" | "medium" | "large";
  block?: boolean;
  icon?: string;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "medium", block, icon, children, className, type = "button", ...rest },
  ref,
) {
  const classes = [
    "nx-button",
    `nx-button--${variant}`,
    size === "small" ? "nx-button--small" : size === "large" ? "nx-button--large" : "",
    block ? "nx-button--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /** Required: the icon is the only content, so it must carry a name. */
  label: string;
  size?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 17, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={["nx-button", "nx-button--icon", className ?? ""].filter(Boolean).join(" ")}
      title={label}
      aria-label={label}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
});

export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "medium",
  icon,
  block,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "small" | "medium" | "large";
  icon?: string;
  block?: boolean;
}) {
  const classes = [
    "nx-button",
    `nx-button--${variant}`,
    size === "small" ? "nx-button--small" : size === "large" ? "nx-button--large" : "",
    block ? "nx-button--block" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Link href={href} className={classes}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export function Badge({ tone = "neutral", glyph, children }: { tone?: Tone; glyph?: string; children: ReactNode }) {
  return (
    <span className={`nx-badge nx-badge--${tone === "neutral" ? "neutral" : tone}`}>
      {glyph ? (
        <span className={`nx-indicator nx-indicator--${tone === "neutral" ? "neutral" : tone}`} aria-hidden="true">
          {glyph}
        </span>
      ) : null}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="nx-kbd">{children}</span>;
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  describedBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      className="nx-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="nx-switch__track">
        <span className="nx-switch__thumb" />
      </span>
      {/* The word is part of the control, so the state never depends on colour. */}
      <span className="nx-switch__state" aria-hidden="true">
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}

export function SliderControl({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  label: string;
  format?: (value: number) => string;
}) {
  return (
    <div className="nx-row" style={{ gap: "var(--nx-space-3)", width: "100%", flexWrap: "nowrap" }}>
      <input
        type="range"
        className="nx-slider"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        aria-valuetext={format ? format(value) : String(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="nx-muted" style={{ minWidth: "5ch", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="nx-segmented" role="radiogroup" aria-label={label}>
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

export function TextField({
  value,
  onChange,
  label,
  help,
  placeholder,
  type = "text",
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  help?: string;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="nx-field">
      <label className="nx-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="nx-input"
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-describedby={help ? `${id}-help` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? (
        <p className="nx-field__help" id={`${id}-help`}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                              */
/* -------------------------------------------------------------------------- */

export function SettingRow({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="nx-setting-row">
      <div className="nx-setting-row__text">
        <div className="nx-setting-row__label">{label}</div>
        {help ? <p className="nx-setting-row__help">{help}</p> : null}
      </div>
      <div className="nx-setting-row__control">{children}</div>
    </div>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  trailing,
  href,
}: {
  icon: string;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  href?: string;
}) {
  const inner = (
    <>
      <span className="nx-list-row__icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="nx-list-row__text">
        <span className="nx-list-row__title">{title}</span>
        <span className="nx-list-row__subtitle">{subtitle}</span>
      </span>
      {trailing ? <span style={{ marginLeft: "auto", display: "flex", gap: "var(--nx-space-2)", alignItems: "center" }}>{trailing}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="nx-list-row">
        {inner}
      </Link>
    );
  }
  return <div className="nx-list-row">{inner}</div>;
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="nx-section">
      <div className="nx-section__heading">
        <h2 className="nx-section__title">{title}</h2>
        {hint ? <span className="nx-section__hint">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}
