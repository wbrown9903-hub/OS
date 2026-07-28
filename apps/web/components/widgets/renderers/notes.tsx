"use client";

import { useState } from "react";
import { TextArea, WidgetShell, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { amount, text, toggle } from "../settings.js";

export function NotesWidget({ settings, freshness, loading, editing }: WidgetRenderProps) {
  const stored = text(settings, "body");
  const [draft, setDraft] = useState(stored);
  const editable = toggle(settings, "editableOnCanvas", true) && !editing;
  const body = editable ? draft : stored;
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <WidgetShell
      title={text(settings, "title", "Notes")}
      freshness={freshness}
      loading={loading ?? false}
      hasData
      footer={toggle(settings, "showWordCount") ? `${words} ${words === 1 ? "word" : "words"}` : undefined}
    >
      {editable ? (
        <TextArea
          value={draft}
          onChange={setDraft}
          rows={6}
          placeholder="Anything you want to remember…"
          monospace={text(settings, "font") === "mono"}
        />
      ) : (
        <p
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            fontSize: 13 * amount(settings, "textSize", 1),
            lineHeight: 1.55,
            color: body ? token.textPrimary : token.textMuted,
            fontFamily: text(settings, "font") === "mono" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit",
          }}
        >
          {body || "This pad is empty. Select it in Nexus Studio to write in it."}
        </p>
      )}
    </WidgetShell>
  );
}
