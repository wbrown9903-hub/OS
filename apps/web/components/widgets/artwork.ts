import type { ImageSourceValue } from "@nexus/schemas";

/**
 * Built-in artwork is generated from theme tokens rather than shipped as image
 * files, so it is original to Nexus OS, weighs nothing, and follows the theme.
 */
const BUILT_IN: Record<string, string> = {
  "nexus-abstract-01": "linear-gradient(135deg, var(--nx-auroraA) 0%, var(--nx-auroraB) 55%, var(--nx-auroraC) 100%)",
  "nexus-abstract-02": "linear-gradient(160deg, var(--nx-auroraC) 0%, var(--nx-auroraA) 70%)",
  "nexus-aurora-01": "radial-gradient(120% 120% at 20% 0%, var(--nx-auroraB) 0%, var(--nx-auroraA) 45%, var(--nx-canvas) 100%)",
  "nexus-gielinor-dusk": "linear-gradient(180deg, var(--nx-auroraA) 0%, var(--nx-auroraC) 60%, var(--nx-canvas) 100%)",
  "nexus-app-tile": "linear-gradient(135deg, var(--nx-surface-raised) 0%, var(--nx-surface-sunken) 100%)",
};

export const builtInArtwork: Array<{ id: string; label: string; css: string }> = [
  { id: "nexus-abstract-01", label: "Abstract — aurora", css: BUILT_IN["nexus-abstract-01"]! },
  { id: "nexus-abstract-02", label: "Abstract — dusk", css: BUILT_IN["nexus-abstract-02"]! },
  { id: "nexus-aurora-01", label: "Aurora glow", css: BUILT_IN["nexus-aurora-01"]! },
  { id: "nexus-gielinor-dusk", label: "Adventure dusk", css: BUILT_IN["nexus-gielinor-dusk"]! },
  { id: "nexus-app-tile", label: "Application tile", css: BUILT_IN["nexus-app-tile"]! },
];

export type ResolvedArtwork =
  | { kind: "gradient"; css: string; alt: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "pending"; reason: string; alt: string };

/**
 * Turns a stored image value into something renderable.
 *
 * Only https addresses are ever handed to the browser here; the authoritative
 * check — including sniffing the real bytes — happens on the server before an
 * upload or a remote image is stored.
 */
export function resolveArtwork(value: ImageSourceValue | null): ResolvedArtwork {
  const fallback = BUILT_IN["nexus-abstract-01"]!;
  if (!value) return { kind: "gradient", css: fallback, alt: "" };
  const alt = value.altText ?? "";

  switch (value.mode) {
    case "builtIn":
      return { kind: "gradient", css: BUILT_IN[value.builtInId] ?? fallback, alt };
    case "upload":
      return value.uploadPath
        ? { kind: "image", src: `/api/media/${encodeURIComponent(value.uploadPath)}`, alt }
        : { kind: "pending", reason: "No file has been uploaded yet.", alt };
    case "remoteURL":
      return value.remoteURL && value.remoteURL.startsWith("https://")
        ? { kind: "image", src: value.remoteURL, alt }
        : { kind: "pending", reason: "Add an https address for this image.", alt };
    case "officialFeed":
      return value.feedId
        ? { kind: "image", src: `/api/media/feed/${encodeURIComponent(value.feedId)}`, alt }
        : { kind: "pending", reason: "Choose which official feed to follow.", alt };
  }
}
