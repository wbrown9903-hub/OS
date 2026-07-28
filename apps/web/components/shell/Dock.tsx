"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useShell } from "@/lib/client/shell-store";
import { actionFromDocument, useActionRunner } from "@/lib/client/actions";
import { Icon } from "./Icon";
import { IconButton } from "./Primitives";

/**
 * The dock.
 *
 * Items come from `document.dock`, never from a hard-coded list, so rearranging
 * the dock in Nexus Studio is an ordinary configuration edit.
 *
 * Magnification is deliberately expressed as a CSS custom property multiplied by
 * `--nx-animation-scale`: when the resolver pins that to zero for reduced motion,
 * the dock stops magnifying entirely instead of merely animating faster.
 */

const MAX_MAGNIFY = 0.42;
const MAX_LIFT = 10;
const INFLUENCE = 110;

type DockStatus = { kind: "running" | "setup" | "idle"; glyph: string; word: string };

export function Dock() {
  const { document, bridge, resolveContext } = useShell();
  const pathname = usePathname();
  const run = useActionRunner();
  const railRef = useRef<HTMLUListElement>(null);
  const [pointerX, setPointerX] = useState<number | null>(null);

  const animationScale = resolveContext.accessibility.reducedMotion
    ? 0
    : document.preferences.animationIntensity;

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLUListElement>) => {
    if (event.pointerType !== "mouse") return;
    setPointerX(event.clientX);
  }, []);

  const statusFor = (item: (typeof document.dock)[number]): DockStatus => {
    const target = item.action.target;
    const internal = target.startsWith("/");
    if (internal && (pathname === target || pathname.startsWith(`${target}/`))) {
      return { kind: "running", glyph: "●", word: "open now" };
    }
    const needsBridge = item.action.type === "launchApplication" || item.requiresApplication !== null;
    if (needsBridge && !bridge.value.available) {
      return { kind: "setup", glyph: "▲", word: "needs Nexus Desktop" };
    }
    return { kind: "idle", glyph: "", word: "" };
  };

  if (document.dock.length === 0) {
    return null;
  }

  return (
    <nav className="nx-dock" aria-label="Dock">
      <ul
        ref={railRef}
        className="nx-dock__rail"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setPointerX(null)}
      >
        {document.dock.map((item) => {
          const intent = actionFromDocument(item.action, item.label);
          const status = statusFor(item);

          // Distance-based magnification, recomputed on every pointer move. The
          // element measures itself so the maths stays correct at any density.
          let magnify = 1;
          let lift = 0;
          if (pointerX !== null && animationScale > 0 && railRef.current) {
            const element = railRef.current.querySelector<HTMLElement>(`[data-dock-id="${CSS.escape(item.id)}"]`);
            if (element) {
              const rect = element.getBoundingClientRect();
              const centre = rect.left + rect.width / 2;
              const distance = Math.abs(pointerX - centre);
              const influence = Math.max(0, 1 - distance / INFLUENCE);
              magnify = 1 + MAX_MAGNIFY * influence * animationScale;
              lift = -MAX_LIFT * influence * animationScale;
            }
          }

          const accessibleName =
            status.kind === "idle" ? item.label : `${item.label}, ${status.word}`;

          return (
            <li key={item.id} style={{ display: "flex" }}>
              <button
                type="button"
                data-dock-id={item.id}
                className="nx-dock__item"
                style={
                  {
                    "--nx-dock-magnify": magnify.toFixed(3),
                    "--nx-dock-lift": `${lift.toFixed(2)}px`,
                  } as React.CSSProperties
                }
                aria-current={status.kind === "running" ? "page" : undefined}
                aria-label={accessibleName}
                onClick={() => void run(intent)}
              >
                <span className="nx-dock__tile">
                  <Icon name={item.icon} size={22} />
                </span>
                <span className="nx-dock__tooltip" aria-hidden="true">
                  {accessibleName}
                </span>
                {status.kind !== "idle" ? (
                  <span
                    className={`nx-dock__status nx-dock__status--${status.kind === "running" ? "running" : "setup"}`}
                    aria-hidden="true"
                  >
                    {status.glyph}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}

        <li className="nx-dock__separator" aria-hidden="true" />

        <li style={{ display: "flex", alignItems: "center" }}>
          <DockPaletteButton />
        </li>
      </ul>
    </nav>
  );
}

function DockPaletteButton() {
  const { setPaletteOpen } = useShell();
  return (
    <IconButton
      icon="magnifyingglass"
      label="Open the command palette"
      onClick={() => setPaletteOpen(true)}
      style={{ width: 42, height: 42 }}
    />
  );
}
