"use client";

import { useMemo, useState } from "react";
import { addWidget } from "@nexus/schemas";
import { Icon } from "../shell/Icon";
import { filterDefinitions, groupDefinitions } from "./studio-model";
import { useStudio } from "./studio-store";

/**
 * The "Add panel" gallery.
 *
 * Its entire contents come from `GET /api/widgets`, which serves the widget
 * definitions. A new widget file therefore appears here — with its name, summary,
 * category, icon, requirements and default size — without this component
 * changing.
 */
export function WidgetGallery() {
  const studio = useStudio();
  const [query, setQuery] = useState("");
  const { page, targetZoneId, setTargetZoneId, definitions, definitionsLoading, runEdit, selectWidget } = studio;

  const groups = useMemo(() => groupDefinitions(filterDefinitions(definitions, query)), [definitions, query]);
  const total = useMemo(() => filterDefinitions(definitions, query).length, [definitions, query]);

  if (!page) {
    return (
      <div className="nx-studio-empty">
        <h2>No page to add to</h2>
        <p>Create a page first, then panels can be added to it.</p>
      </div>
    );
  }

  return (
    <div className="nx-studio-gallery">
      <div className="nx-field">
        <label className="nx-field__label" htmlFor="studio-gallery-search">
          Search panels
        </label>
        <input
          id="studio-gallery-search"
          className="nx-input"
          type="search"
          placeholder="Clock, orders, notes…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="nx-field__help" role="status">
          {definitionsLoading
            ? "Loading the panel catalogue…"
            : `${total} panel${total === 1 ? "" : "s"} available.`}
        </p>
      </div>

      <div className="nx-field">
        <label className="nx-field__label" htmlFor="studio-gallery-zone">
          Add to
        </label>
        <select
          id="studio-gallery-zone"
          className="nx-select"
          value={targetZoneId}
          onChange={(event) => setTargetZoneId(event.target.value)}
        >
          {page.zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.label}
            </option>
          ))}
        </select>
      </div>

      {groups.length === 0 ? (
        <div className="nx-studio-empty">
          <h2>Nothing matches “{query}”</h2>
          <p>Try a shorter word, or clear the search to see every panel this build has.</p>
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.category} className="nx-studio-gallery__group">
          <h3>{group.category}</h3>
          <ul>
            {group.widgets.map((definition) => (
              <li key={definition.type}>
                <button
                  type="button"
                  className="nx-studio-gallery__card"
                  onClick={async () => {
                    const zoneId = targetZoneId || page.zones[0]?.id || "main";
                    let addedId: string | null = null;
                    const saved = await runEdit((document) => {
                      const result = addWidget(document, {
                        pageId: page.id,
                        type: definition.type,
                        schema: definition.schema,
                        zoneId,
                        span: definition.defaultSpan,
                        label: `Add ${definition.name}`,
                      });
                      const created = result.document.pages
                        .find((candidate) => candidate.id === page.id)
                        ?.widgets.at(-1);
                      addedId = created?.id ?? null;
                      return result;
                    }, `Add ${definition.name}`);
                    if (saved && addedId) selectWidget(addedId);
                  }}
                >
                  <span className="nx-studio-gallery__icon" aria-hidden="true">
                    <Icon name={definition.icon} size={18} />
                  </span>
                  <span className="nx-studio-gallery__text">
                    <strong>{definition.name}</strong>
                    <span>{definition.summary}</span>
                    {definition.previewHint ? <em>{definition.previewHint}</em> : null}
                    <span className="nx-studio-gallery__meta">
                      {definition.defaultSpan.columns} of 12 columns
                      {definition.requiresConnection ? ` · needs ${definition.requiresConnection}` : ""}
                      {definition.requiresBridge ? " · needs Nexus Desktop" : ""}
                      {definition.requiresPermission ? ` · needs ${definition.requiresPermission} permission` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
