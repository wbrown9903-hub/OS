import type { ButtonHTMLAttributes, ReactNode } from "react";
import { duration, token } from "./tokens.js";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "small" | "medium";
  children: ReactNode;
}

export function Button({ variant = "secondary", size = "medium", style, children, ...rest }: ButtonProps) {
  const palette = {
    primary: { background: token.accent, colour: token.accentContrast, border: token.accent },
    secondary: { background: token.surfaceRaised, colour: token.textPrimary, border: token.border },
    quiet: { background: "transparent", colour: token.textSecondary, border: "transparent" },
    danger: { background: "transparent", colour: token.danger, border: token.danger },
  }[variant];

  return (
    <button
      type="button"
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: palette.background,
        color: palette.colour,
        border: `1px solid ${palette.border}`,
        borderRadius: token.radiusSmall,
        padding: size === "small" ? "4px 8px" : "7px 12px",
        fontSize: size === "small" ? 12 : 13,
        fontWeight: 550,
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
        transition: `background ${duration(120)}, border-color ${duration(120)}`,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export interface LinkButtonProps {
  href: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  children: ReactNode;
  target?: string;
  rel?: string;
}

/** A link that looks like a button. Used when an action resolves to an address. */
export function LinkButton({ href, variant = "secondary", size = "medium", children, target, rel }: LinkButtonProps) {
  const palette = {
    primary: { background: token.accent, colour: token.accentContrast, border: token.accent },
    secondary: { background: token.surfaceRaised, colour: token.textPrimary, border: token.border },
    quiet: { background: "transparent", colour: token.textSecondary, border: "transparent" },
    danger: { background: "transparent", colour: token.danger, border: token.danger },
  }[variant];

  return (
    <a
      href={href}
      target={target}
      rel={rel ?? (target === "_blank" ? "noreferrer noopener" : undefined)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: palette.background,
        color: palette.colour,
        border: `1px solid ${palette.border}`,
        borderRadius: token.radiusSmall,
        padding: size === "small" ? "4px 8px" : "7px 12px",
        fontSize: size === "small" ? 12 : 13,
        fontWeight: 550,
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}
