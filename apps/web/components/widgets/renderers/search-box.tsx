"use client";

import { useState } from "react";
import { Badge, TextInput, WidgetShell, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { choices, text } from "../settings.js";

const SCOPE_LABELS: Record<string, string> = {
  apps: "Applications",
  files: "Files",
  knowledge: "Notes",
  conversations: "Conversations",
  settings: "Settings",
  web: "Web",
};

export function SearchBoxWidget({ settings, freshness, loading }: WidgetRenderProps) {
  const [query, setQuery] = useState("");
  const scopes = choices(settings, "scopes");

  return (
    <WidgetShell freshness={freshness} loading={loading ?? false} hasData padding={12}>
      <form
        role="search"
        onSubmit={(event) => event.preventDefault()}
        style={{ display: "grid", gap: 8 }}
      >
        <label style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }} htmlFor="nx-search">
          Search Nexus OS
        </label>
        <TextInput
          id="nx-search"
          value={query}
          onChange={setQuery}
          placeholder={text(settings, "placeholder", "Search Nexus OS…")}
        />
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {scopes.length === 0 ? (
            <span style={{ fontSize: 11, color: token.textMuted }}>
              No places are selected to search. Choose at least one in Nexus Studio.
            </span>
          ) : (
            scopes.map((scope) => (
              <Badge key={scope} tone="neutral">
                {SCOPE_LABELS[scope] ?? scope}
              </Badge>
            ))
          )}
          {text(settings, "shortcut") ? (
            <span style={{ fontSize: 11, color: token.textMuted, marginLeft: "auto" }}>
              {text(settings, "shortcut")}
            </span>
          ) : null}
        </span>
      </form>
    </WidgetShell>
  );
}
