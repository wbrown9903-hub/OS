import { duration, resolveColour, token } from "./tokens.js";

export interface ProgressBarProps {
  /** 0–1, or null when the underlying figure is unknown. */
  value: number | null;
  label: string;
  colour?: string;
  height?: number;
}

export function ProgressBar({ value, label, colour = "token:accent", height = 8 }: ProgressBarProps) {
  const clamped = value === null ? null : Math.max(0, Math.min(1, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped === null ? undefined : Math.round(clamped * 100)}
      aria-valuetext={clamped === null ? "Not known yet" : `${Math.round(clamped * 100)} per cent`}
      style={{
        height,
        borderRadius: 999,
        background: token.surfaceSunken,
        border: `1px solid ${token.border}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: clamped === null ? "0%" : `${clamped * 100}%`,
          background: resolveColour(colour),
          transition: `width ${duration(300)} ease-out`,
        }}
      />
    </div>
  );
}
