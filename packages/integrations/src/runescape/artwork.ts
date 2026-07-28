/**
 * Built-in original artwork — the last link in the news banner fallback chain.
 *
 * These are drawn here as abstract geometry (an inline SVG data URI, generated
 * from the design tokens) and are **original work created for Nexus OS**. They
 * deliberately contain no Jagex logo, character, screenshot or trade dress: if
 * the official feed offers no image and the user has set no banner of their own,
 * Nexus shows its own art rather than borrowing someone else's.
 *
 * These strings are first-party constants compiled into the product. They never
 * arrive over the network, so they are not (and must not be) passed through the
 * remote-image byte sniffer — that validator exists for *untrusted* bytes, and
 * it rejects SVG on purpose.
 */

export interface BuiltInArtwork {
  id: string;
  /** Alt text. Always present: artwork is decorative but must still be described. */
  alt: string;
  /** `data:image/svg+xml,…`, safe to use as a CSS background or `img` src. */
  dataUri: string;
  /** Attribution line shown under the banner. */
  attribution: string;
  aspectRatio: string;
}

function svgDataUri(svg: string): string {
  // Percent-encode rather than base64: smaller, and readable in a diff.
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

/** Deep blue with a low sweeping horizon — used for RuneScape. */
const RUNESCAPE_BANNER = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" role="img" aria-label="Abstract landscape">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#101a3a"/>
      <stop offset="60%" stop-color="#1d2f63"/>
      <stop offset="100%" stop-color="#2b4a86"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f2c14e" stop-opacity="0"/>
      <stop offset="50%" stop-color="#f2c14e" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#f2c14e" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="400" fill="url(#sky)"/>
  <circle cx="880" cy="150" r="54" fill="#f2c14e" opacity="0.9"/>
  <rect x="0" y="146" width="1200" height="8" fill="url(#glow)"/>
  <path d="M0 300 L180 232 L330 288 L520 208 L700 292 L880 236 L1060 296 L1200 250 L1200 400 L0 400 Z" fill="#0d1530" opacity="0.92"/>
  <path d="M0 336 L220 292 L420 340 L640 296 L860 344 L1080 300 L1200 332 L1200 400 L0 400 Z" fill="#080d1f"/>
</svg>`;

/** Warmer, lower-contrast variant used for Old School RuneScape. */
const OSRS_BANNER = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" role="img" aria-label="Abstract landscape">
  <defs>
    <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a1c10"/>
      <stop offset="55%" stop-color="#5a3a1c"/>
      <stop offset="100%" stop-color="#8a5a28"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="400" fill="url(#dusk)"/>
  <circle cx="300" cy="130" r="46" fill="#ffd98a" opacity="0.85"/>
  <path d="M0 288 L200 244 L400 300 L600 232 L800 296 L1000 248 L1200 292 L1200 400 L0 400 Z" fill="#241708" opacity="0.9"/>
  <path d="M0 340 L240 306 L480 348 L720 300 L960 346 L1200 312 L1200 400 L0 400 Z" fill="#150d04"/>
</svg>`;

/** Neutral fallback used when the game is unknown. */
const NEUTRAL_BANNER = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" role="img" aria-label="Abstract pattern">
  <rect width="1200" height="400" fill="#151821"/>
  <g fill="none" stroke="#39415a" stroke-width="2" opacity="0.6">
    <path d="M0 340 Q300 240 600 320 T1200 280"/>
    <path d="M0 300 Q300 200 600 280 T1200 240"/>
    <path d="M0 260 Q300 160 600 240 T1200 200"/>
  </g>
  <circle cx="1020" cy="120" r="40" fill="#4c6ef5" opacity="0.35"/>
</svg>`;

export const BUILT_IN_ARTWORK: Record<string, BuiltInArtwork> = {
  runescape: {
    id: "runescape.banner.original",
    alt: "An abstract night landscape drawn for Nexus OS",
    dataUri: svgDataUri(RUNESCAPE_BANNER),
    attribution: "Original artwork by Nexus OS",
    aspectRatio: "3 / 1",
  },
  osrs: {
    id: "osrs.banner.original",
    alt: "An abstract dusk landscape drawn for Nexus OS",
    dataUri: svgDataUri(OSRS_BANNER),
    attribution: "Original artwork by Nexus OS",
    aspectRatio: "3 / 1",
  },
  neutral: {
    id: "neutral.banner.original",
    alt: "An abstract pattern drawn for Nexus OS",
    dataUri: svgDataUri(NEUTRAL_BANNER),
    attribution: "Original artwork by Nexus OS",
    aspectRatio: "3 / 1",
  },
};

export function builtInArtworkFor(game: string): BuiltInArtwork {
  return BUILT_IN_ARTWORK[game] ?? BUILT_IN_ARTWORK.neutral!;
}
