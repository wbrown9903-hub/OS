"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShell } from "@/lib/client/shell-store";
import { useActionRunner, type RunnableIntent } from "@/lib/client/actions";
import { buildPaletteEntries, type PaletteEntry, type PaletteGroup } from "@/lib/client/commands";
import { interpretPhrase } from "@/lib/client/natural-language";
import { fuzzyMatch, fuzzyMatchAny, highlightSegments } from "@/lib/client/fuzzy";
import { apiGet } from "@/lib/client/api";
import type { SearchResult } from "@/lib/client/types";
import { useFocusTrap } from "@/lib/client/focus-trap";
import { Icon } from "./Icon";
import { Button, Kbd } from "./Primitives";

const GROUP_ORDER: PaletteGroup[] = [
  "Suggested",
  "Actions",
  "Apps & screens",
  "Dashboards",
  "Workspaces",
  "Connections",
  "Settings",
  "Help",
  "Knowledge",
];

const MAX_PER_GROUP = 6;

function Highlighted({ text, positions }: { text: string; positions: number[] }) {
  const segments = highlightSegments(text, positions);
  return (
    <>
      {segments.map((segment, index) =>
        segment.matched ? (
          <span key={index} className="nx-highlight">
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function CommandPalette() {
  const shell = useShell();
  const { paletteOpen, setPaletteOpen, paletteSeed, document: configDocument, helpTopics, connections, activeWorkspaceId } = shell;
  const run = useActionRunner();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [remote, setRemote] = useState<{ results: SearchResult[]; loading: boolean }>({ results: [], loading: false });
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  useEffect(() => setPortalTarget(window.document.body), []);

  useEffect(() => {
    if (!paletteOpen) return;
    setQuery(paletteSeed);
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [paletteOpen, paletteSeed]);

  const close = useCallback(() => setPaletteOpen(false), [setPaletteOpen]);
  useFocusTrap(containerRef, { active: paletteOpen, onEscape: close, autoFocus: false });

  /* --- Local catalogue ----------------------------------------------------- */

  const entries = useMemo(
    () =>
      buildPaletteEntries({
        document: configDocument,
        helpTopics: helpTopics.value,
        connections: connections.value,
        activeWorkspaceId,
      }),
    [configDocument, helpTopics.value, connections.value, activeWorkspaceId],
  );

  /* --- Remote knowledge search -------------------------------------------- */

  useEffect(() => {
    if (!paletteOpen) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemote({ results: [], loading: false });
      return;
    }
    let cancelled = false;
    setRemote((current) => ({ ...current, loading: true }));
    const timer = window.setTimeout(() => {
      void apiGet<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(trimmed)}`).then((result) => {
        if (cancelled) return;
        setRemote({
          results: result.ok && Array.isArray(result.data.results) ? result.data.results.slice(0, MAX_PER_GROUP) : [],
          loading: false,
        });
      });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, paletteOpen]);

  /* --- Ranking ------------------------------------------------------------- */

  interface Row {
    key: string;
    group: PaletteGroup;
    title: string;
    subtitle: string;
    icon: string;
    positions: number[];
    intent: RunnableIntent;
  }

  const rows = useMemo<Row[]>(() => {
    const trimmed = query.trim();
    const collected: Array<Row & { score: number }> = [];

    for (const entry of entries) {
      if (!trimmed) {
        // With an empty query the palette shows the most useful starting points
        // rather than an arbitrary slice of everything.
        const suggested =
          entry.group === "Apps & screens" || entry.group === "Actions" || entry.group === "Workspaces";
        if (!suggested) continue;
        collected.push({ ...rowFrom(entry, []), score: entry.group === "Apps & screens" ? 10 : 5 });
        continue;
      }
      const match = fuzzyMatchAny([entry.title, ...entry.keywords, entry.subtitle], trimmed);
      if (!match) continue;
      const titleMatch = fuzzyMatch(entry.title, trimmed);
      collected.push({ ...rowFrom(entry, titleMatch?.positions ?? []), score: match.score });
    }

    for (const result of remote.results) {
      const href = result.href;
      collected.push({
        key: `knowledge:${result.kind}:${result.title}`,
        group: "Knowledge",
        title: result.title,
        subtitle: result.subtitle || result.kind,
        icon: "doc.text",
        positions: fuzzyMatch(result.title, query.trim())?.positions ?? [],
        intent: href
          ? { title: `Open ${result.title}`, detail: result.subtitle, action: { kind: "navigate", href }, confirmation: null }
          : {
              title: result.title,
              detail: "This result has no screen to open.",
              action: {
                kind: "unsupported",
                reason: "That result does not point anywhere Nexus OS can open.",
                nextStep: "Search the Cloud Brain directly to see the full record.",
                href: "/brain",
              },
              confirmation: null,
            },
        score: 400,
      });
    }

    const byGroup = new Map<PaletteGroup, Array<Row & { score: number }>>();
    for (const row of collected) {
      const list = byGroup.get(row.group) ?? [];
      list.push(row);
      byGroup.set(row.group, list);
    }

    const ordered: Row[] = [];
    for (const group of GROUP_ORDER) {
      const list = byGroup.get(group);
      if (!list) continue;
      list.sort((a, b) => b.score - a.score);
      for (const row of list.slice(0, MAX_PER_GROUP)) ordered.push(row);
    }
    return ordered;
  }, [entries, query, remote.results]);

  useEffect(() => {
    setActiveIndex((index) => (index >= rows.length ? 0 : index));
  }, [rows.length]);

  /* --- Natural language ---------------------------------------------------- */

  const interpretation = useMemo(
    () => (query.trim().length >= 3 ? interpretPhrase(query, { document: configDocument, entries }) : null),
    [query, configDocument, entries],
  );

  /* --- Keyboard ------------------------------------------------------------ */

  const activate = useCallback(
    async (intent: RunnableIntent) => {
      close();
      await run(intent);
    },
    [close, run],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (rows.length === 0 ? 0 : (index + 1) % rows.length));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (rows.length === 0 ? 0 : (index - 1 + rows.length) % rows.length));
      } else if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(Math.max(0, rows.length - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        // A recognised phrase wins over the ranked list — it is the thing the
        // person actually asked for, and it is spelled out above the results.
        if (interpretation && rows.length > 0 && activeIndex === 0 && query.trim().length >= 3) {
          void activate(interpretation);
          return;
        }
        const row = rows[activeIndex];
        if (row) void activate(row.intent);
      }
    },
    [rows, activeIndex, interpretation, query, activate],
  );

  useEffect(() => {
    if (!paletteOpen) return;
    const element = window.document.getElementById(`${listboxId}-option-${activeIndex}`);
    element?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listboxId, paletteOpen]);

  if (!paletteOpen || !portalTarget) return null;

  let renderedGroup: PaletteGroup | null = null;

  return createPortal(
    <div
      className="nx-palette-scrim"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div ref={containerRef} className="nx-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="nx-palette__search">
          <Icon name="magnifyingglass" size={18} />
          <input
            ref={inputRef}
            className="nx-palette__input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={rows[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
            aria-autocomplete="list"
            aria-label="Search apps, commands, pages, settings, help and knowledge"
            placeholder="Search, or say what you want — “open runescape”, “show today's orders”"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <Button variant="ghost" size="small" onClick={close}>
            Esc
          </Button>
        </div>

        {interpretation ? (
          <div className="nx-interpretation">
            <span className="nx-interpretation__label">Nexus OS understood this as</span>
            <span className="nx-interpretation__action">{interpretation.title}</span>
            <span className="nx-interpretation__detail">{interpretation.detail}</span>
            <div className="nx-interpretation__row">
              <Button variant="primary" size="small" onClick={() => void activate(interpretation)}>
                {interpretation.confirmation ? "Review and run" : "Run"}
              </Button>
              {interpretation.confirmation ? (
                <span className="nx-interpretation__detail">You will be asked to confirm before anything changes.</span>
              ) : (
                <span className="nx-interpretation__detail">
                  Press <Kbd>Return</Kbd> to run it.
                </span>
              )}
            </div>
          </div>
        ) : null}

        <div className="nx-palette__results" id={listboxId} role="listbox" aria-label="Results">
          {rows.length === 0 ? (
            <div style={{ padding: "var(--nx-space-5)" }}>
              <div className="nx-state__title">No matches for “{query.trim()}”</div>
              <p className="nx-state__body">
                Try a shorter word, or the name of a screen such as “settings”, “commerce” or “help”. You can also type a
                whole phrase, for example “open runescape”.
              </p>
            </div>
          ) : (
            rows.map((row, index) => {
              const showGroup = row.group !== renderedGroup;
              renderedGroup = row.group;
              return (
                <div key={row.key}>
                  {showGroup ? (
                    <div className="nx-palette__group-label" role="presentation">
                      {row.group}
                      {row.group === "Knowledge" && remote.loading ? " · searching…" : ""}
                    </div>
                  ) : null}
                  <div
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className="nx-palette__item"
                    tabIndex={-1}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => void activate(row.intent)}
                  >
                    <span className="nx-palette__icon">
                      <Icon name={row.icon} size={16} />
                    </span>
                    <span className="nx-palette__text">
                      <span className="nx-palette__title">
                        <Highlighted text={row.title} positions={row.positions} />
                      </span>
                      <span className="nx-palette__subtitle">{row.subtitle}</span>
                    </span>
                    {row.intent.confirmation ? (
                      <span className="nx-palette__hint">
                        <span className="nx-badge nx-badge--caution">Asks first</span>
                      </span>
                    ) : index === activeIndex ? (
                      <span className="nx-palette__hint" aria-hidden="true">
                        <Kbd>↵</Kbd>
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="nx-palette__footer">
          <span className="nx-palette__legend">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="nx-palette__legend">
            <Kbd>↵</Kbd> run
          </span>
          <span className="nx-palette__legend">
            <Kbd>esc</Kbd> close
          </span>
          <span className="nx-palette__legend" style={{ marginLeft: "auto" }}>
            {rows.length} result{rows.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>,
    portalTarget,
  );

  function rowFrom(entry: PaletteEntry, positions: number[]): Row {
    return {
      key: entry.id,
      group: entry.group,
      title: entry.title,
      subtitle: entry.subtitle,
      icon: entry.icon,
      positions,
      intent: entry.intent,
    };
  }
}
