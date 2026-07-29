"use client";

import { useMemo } from "react";
import { freshnessFor, resolvePage, type DataFreshness, type WidgetDefinition } from "@nexus/schemas";
import { CommandPalette } from "../components/shell/CommandPalette.js";
import { Dock } from "../components/shell/Dock.js";
import { ConfirmationHost, ToastHost } from "../components/shell/Overlays.js";
import { TopBar } from "../components/shell/TopBar.js";
import { rendererFor } from "../components/widgets/registry.js";
import { useShell } from "../lib/client/shell-store.js";

/**
 * The desktop. Everything here is derived: the shell asks the resolver what to
 * draw for this display, this theme and these accessibility settings, then hands
 * each widget its own settings and data envelope.
 */
export default function DesktopPage() {
  const shell = useShell();
  const { document: config, resolveContext, styleVariables, theme, activePageId } = shell;

  const page = config.pages.find((candidate) => candidate.id === activePageId) ?? config.pages[0];

  const resolved = useMemo(
    () => (page ? resolvePage(config, page, resolveContext) : null),
    [config, page, resolveContext],
  );

  const definitions = shell.definitions.value;
  const definitionFor = (type: string): WidgetDefinition | undefined =>
    definitions.find((candidate) => candidate.type === type);

  if (!page || !resolved) {
    return (
      <main className="nx-shell" style={styleVariables as React.CSSProperties}>
        <p className="nx-notice">
          This layout has no pages. Open Nexus Studio to create one, or restore the default layout from
          Settings › Recovery.
        </p>
      </main>
    );
  }

  return (
    <div
      className="nx-shell"
      data-theme={theme.appearance}
      data-contrast={theme.highContrast ? "high" : "normal"}
      style={styleVariables as React.CSSProperties}
    >
      <TopBar />

      <div className="nx-body">
        <Dock />

        <main id="nx-main" className="nx-canvas" tabIndex={-1} aria-label={`${page.title} dashboard`}>
          {resolved.zones.map((zone) => (
            <section
              key={zone.zone.id}
              className="nx-zone"
              data-layout={zone.layout}
              aria-label={zone.zone.label}
            >
              <div
                className="nx-zone__grid"
                style={{ ["--nx-zone-columns" as string]: String(zone.columns) }}
              >
              {zone.widgets.map((item) => {
                const definition = definitionFor(item.node.type);
                const Renderer = rendererFor(item.node.type);

                // A widget that cannot show real data receives a freshness state
                // saying exactly why, so it renders an explanation with a way to
                // fix it rather than an empty panel or an invented number.
                const freshness: DataFreshness = item.unavailable
                  ? {
                      state: "unavailable",
                      reason: item.unavailable.summary,
                      nextStep: item.unavailable.nextStep,
                    }
                  : definition?.requiresConnection
                    ? { state: "notConfigured", nextStep: "Connect this service to see live information." }
                    : freshnessFor(new Date(), item.node.refreshSeconds);

                return (
                  <div
                    key={item.node.id}
                    className="nx-slot"
                    style={{
                      gridColumn: `span ${Math.min(item.columns, zone.columns)}`,
                      gridRow: `span ${item.rows}`,
                    }}
                  >
                    <Renderer
                      node={item.node}
                      settings={item.node.settings}
                      data={null}
                      freshness={freshness}
                      loading={shell.documentLoading}
                    />
                  </div>
                );
              })}
              </div>

              {zone.widgets.length === 0 ? (
                <p className="nx-zone-empty">
                  Nothing in {zone.zone.label} yet. Open Nexus Studio to add a panel.
                </p>
              ) : null}
            </section>
          ))}
        </main>
      </div>

      <CommandPalette />
      <ConfirmationHost />
      <ToastHost />
    </div>
  );
}
