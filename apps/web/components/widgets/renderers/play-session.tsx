"use client";

import { useEffect, useState } from "react";
import { Button, ProgressBar, WidgetShell, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { amount, text, toggle } from "../settings.js";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function PlaySessionWidget({ settings, freshness, loading, editing }: WidgetRenderProps) {
  const goal = Math.max(60, amount(settings, "goalMinutes", 3600));
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startedAt === null || editing) return;
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, editing]);

  return (
    <WidgetShell
      title={text(settings, "title", "Session")}
      freshness={freshness}
      loading={loading ?? false}
      hasData
      footer={toggle(settings, "showTotalToday", true) ? "Today's total is counted only while this timer runs." : undefined}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 650, color: token.textPrimary, fontVariantNumeric: "tabular-nums" }}>
          {startedAt === null ? "Not started" : formatDuration(elapsed)}
        </span>
        <ProgressBar value={startedAt === null ? null : Math.min(1, elapsed / goal)} label="Progress towards session goal" />
        <span style={{ fontSize: 11, color: token.textMuted }}>Goal: {formatDuration(goal)}</span>
        <span style={{ display: "flex", gap: 6 }}>
          {startedAt === null ? (
            <Button variant="primary" size="small" onClick={() => setStartedAt(Date.now())}>
              Start
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                setStartedAt(null);
                setElapsed(0);
              }}
            >
              Stop
            </Button>
          )}
        </span>
      </div>
    </WidgetShell>
  );
}
