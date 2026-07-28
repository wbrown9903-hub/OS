"use client";

import { useEffect, useState } from "react";
import { WidgetShell, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { choice, rows, text, toggle } from "../settings.js";

const WORDS = ["o'clock", "five past", "ten past", "quarter past", "twenty past", "twenty-five past", "half past"];

function formatTime(date: Date, hourFormat: string, showSeconds: boolean, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    ...(showSeconds ? { second: "2-digit" } : {}),
    ...(hourFormat === "system" ? {} : { hour12: hourFormat === "12" }),
    ...(timeZone ? { timeZone } : {}),
  };
  try {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  }
}

export function ClockWidget({ settings, freshness, loading }: WidgetRenderProps) {
  const showSeconds = toggle(settings, "showSeconds");
  const [now, setNow] = useState<Date | null>(null);

  // Rendered on the client only, so the server and the browser can never disagree
  // about the time and cause a hydration mismatch.
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), showSeconds ? 1000 : 15000);
    return () => window.clearInterval(timer);
  }, [showSeconds]);

  const style = choice(settings, "style", "digital");
  const hourFormat = choice(settings, "hourFormat", "system");
  const dateFormat = choice(settings, "dateFormat", "long");

  const dateOptions: Intl.DateTimeFormatOptions =
    dateFormat === "numeric"
      ? { day: "2-digit", month: "2-digit", year: "numeric" }
      : dateFormat === "short"
        ? { weekday: "short", day: "numeric", month: "short" }
        : { weekday: "long", day: "numeric", month: "long" };

  const wordy = now ? `${WORDS[Math.round(now.getMinutes() / 5)] ?? ""} ${now.getHours() % 12 || 12}` : "";

  return (
    <WidgetShell freshness={freshness} loading={loading ?? false} hasData padding={16}>
      <div style={{ display: "grid", gap: 4 }}>
        <span
          style={{
            fontSize: style === "minimal" ? 22 : style === "wordy" ? 24 : 40,
            fontWeight: style === "minimal" ? 500 : 650,
            letterSpacing: -1,
            color: token.textPrimary,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {now === null ? "—" : style === "wordy" ? wordy : formatTime(now, hourFormat, showSeconds)}
        </span>
        {toggle(settings, "showDate", true) ? (
          <span style={{ fontSize: 12, color: token.textSecondary }}>
            {now === null ? "" : new Intl.DateTimeFormat(undefined, dateOptions).format(now)}
          </span>
        ) : null}
        {rows(settings, "extraZones").map((zone, index) => (
          <span key={index} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: token.textSecondary }}>
            <span>{text(zone, "label", text(zone, "timeZone"))}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {now === null ? "—" : formatTime(now, hourFormat, false, text(zone, "timeZone"))}
            </span>
          </span>
        ))}
      </div>
    </WidgetShell>
  );
}
