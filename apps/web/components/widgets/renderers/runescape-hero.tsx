import { Panel, token } from "@nexus/ui";
import type { WidgetRenderProps } from "../types.js";
import { ActionButton } from "../actions.js";
import { amount, action as readAction, choice, image, text, toggle } from "../settings.js";
import { resolveArtwork } from "../artwork.js";

const GAME_LABELS: Record<string, string> = {
  osrs: "Old School RuneScape",
  rs3: "RuneScape 3",
  both: "Old School RuneScape and RuneScape 3",
};

export function RunescapeHeroWidget({ settings }: WidgetRenderProps) {
  const artwork = resolveArtwork(image(settings, "banner"));
  const overlay = Math.max(0, Math.min(1, amount(settings, "overlayStrength", 0.45)));
  const height = amount(settings, "height", 260);
  const game = choice(settings, "game", "osrs");

  return (
    <Panel padding={0} style={{ overflow: "hidden", position: "relative", minHeight: height }}>
      <div style={{ position: "absolute", inset: 0 }} aria-hidden={artwork.alt ? undefined : "true"}>
        {artwork.kind === "image" ? (
          <img
            src={artwork.src}
            alt={artwork.alt}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            role={artwork.alt ? "img" : undefined}
            aria-label={artwork.alt || undefined}
            style={{ width: "100%", height: "100%", background: artwork.kind === "gradient" ? artwork.css : token.surfaceSunken }}
          />
        )}
      </div>
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${overlay})` }} aria-hidden="true" />

      <div
        style={{
          position: "relative",
          display: "grid",
          alignContent: "end",
          gap: 8,
          minHeight: height,
          padding: 24,
        }}
      >
        {artwork.kind === "pending" ? (
          <span style={{ fontSize: 11, color: token.textSecondary }}>{artwork.reason}</span>
        ) : null}
        <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: token.textSecondary }}>
          {GAME_LABELS[game] ?? game}
          {toggle(settings, "showPlayerName") && text(settings, "playerName") ? ` · ${text(settings, "playerName")}` : ""}
        </span>
        <h2 style={{ margin: 0, fontSize: 30, fontWeight: 700, color: "#FFFFFF", letterSpacing: -0.5 }}>
          {text(settings, "title", "Gielinor awaits")}
        </h2>
        {text(settings, "subtitle") ? (
          <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.86)", maxWidth: "52ch" }}>
            {text(settings, "subtitle")}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <ActionButton
            action={readAction(settings, "primaryAction")}
            label={text(settings, "primaryActionLabel", "Play now")}
            variant="primary"
          />
          <ActionButton
            action={readAction(settings, "secondaryAction")}
            label={text(settings, "secondaryActionLabel", "Latest news")}
            variant="secondary"
          />
        </div>
      </div>
    </Panel>
  );
}
