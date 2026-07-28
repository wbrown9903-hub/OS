import type { ReactNode } from "react";
import { token } from "./tokens.js";

export interface FieldProps {
  label: string;
  /** Plain-language explanation, shown under the control rather than hidden. */
  help: string;
  htmlFor?: string;
  /** An inline problem with the current value, always with a way forward. */
  problem?: string | null;
  /** An accessibility caution, e.g. missing alt text or a failing contrast pair. */
  caution?: string | null;
  advanced?: boolean;
  children: ReactNode;
}

/** The one field layout used by every inspector control. */
export function Field({ label, help, htmlFor, problem, caution, advanced, children }: FieldProps) {
  return (
    <div style={{ display: "grid", gap: 5, paddingBottom: 12 }}>
      <label
        htmlFor={htmlFor}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: token.textPrimary }}
      >
        {label}
        {advanced ? (
          <span style={{ fontSize: 10, fontWeight: 600, color: token.textMuted, border: `1px solid ${token.border}`, borderRadius: 999, padding: "0 6px" }}>
            Advanced
          </span>
        ) : null}
      </label>
      {children}
      <span style={{ fontSize: 11, color: token.textMuted, lineHeight: 1.45 }}>{help}</span>
      {caution ? (
        <span style={{ fontSize: 11, color: token.warning, lineHeight: 1.45 }}>▲ {caution}</span>
      ) : null}
      {problem ? (
        <span role="alert" style={{ fontSize: 11, color: token.danger, lineHeight: 1.45 }}>
          ▲ {problem}
        </span>
      ) : null}
    </div>
  );
}
