import { duration, token } from "./tokens.js";

/**
 * The loading placeholder. It pulses only as much as the resolver's animation
 * scale allows, so it is completely still under reduced motion.
 */
export function Skeleton({ rows = 3, height = 14 }: { rows?: number; height?: number }) {
  return (
    <div role="status" aria-live="polite" style={{ display: "grid", gap: 8 }}>
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        Loading…
      </span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          style={{
            height,
            width: index === rows - 1 ? "60%" : "100%",
            borderRadius: token.radiusSmall,
            background: `linear-gradient(90deg, ${token.surfaceSunken}, ${token.surfaceRaised}, ${token.surfaceSunken})`,
            backgroundSize: "200% 100%",
            animation: `nx-skeleton ${duration(1400)} ease-in-out infinite`,
          }}
        />
      ))}
      <style>{"@keyframes nx-skeleton{0%{background-position:0% 0}100%{background-position:-200% 0}}"}</style>
    </div>
  );
}
