#!/usr/bin/env node
/**
 * Nexus OS — original branding, generated.
 *
 * Everything this file produces is drawn procedurally from geometry and colour
 * defined here. Nothing is traced, downloaded or derived from anyone else's
 * artwork, and there is no native image dependency: the PNG encoder and the
 * drawing surface are ours (scripts/lib/png.mjs).
 *
 * The visual language, in one paragraph, so future changes stay coherent:
 *   Nexus is a *constellation*. A bright central node, an orbit of smaller nodes
 *   on a hexagonal lattice, and beams connecting them. Surfaces are never flat —
 *   a deep base gradient, one warm/cool aurora light source off-centre, a
 *   diagonal sheen, a rim highlight, and a fine grain that stops banding. The
 *   mark is geometric and mathematical; the backgrounds are atmospheric. Nothing
 *   is a literal picture of anything.
 *
 * Run:  node scripts/generate-assets.mjs [--only icons|themes|banners|tutorials|mark]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Surface,
  hex,
  mix,
  clamp,
  lerp,
  smoothstep,
  gradient,
  fractalNoise,
  hash2,
  squircleDistance,
  segmentDistance,
  coverage,
} from "./lib/png.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "assets");

const only = (() => {
  const index = process.argv.indexOf("--only");
  return index === -1 ? null : process.argv[index + 1];
})();

const written = [];

function write(relativePath, buffer) {
  const target = path.join(ASSETS, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  written.push({ file: `assets/${relativePath}`, bytes: buffer.length });
  const kb = (buffer.length / 1024).toFixed(1);
  process.stdout.write(`  wrote assets/${relativePath} (${kb} KB)\n`);
}

/* -------------------------------------------------------------------------- */
/* Theme tokens                                                                */
/*                                                                             */
/* Read from packages/schemas/src/themes.ts so the artwork can never drift from */
/* the product's own palette. That file is owned by another part of the project, */
/* so parsing is deliberately tolerant and there is a built-in fallback.        */
/* -------------------------------------------------------------------------- */

const FALLBACK_THEMES = [
  { id: "nexus-obsidian", appearance: "dark", highContrast: false, canvas: "#07090F", canvasInset: "#0B0E17", accent: "#4CC9F0", auroraA: "#1B3A6B", auroraB: "#0E7490", auroraC: "#3B1E6E", textPrimary: "#EEF2FA" },
  { id: "arcane-gold", appearance: "dark", highContrast: false, canvas: "#0F0B06", canvasInset: "#161009", accent: "#E0A63C", auroraA: "#5A3B12", auroraB: "#8A5A18", auroraC: "#2E1F0A", textPrimary: "#F6EEDD" },
  { id: "clean-studio", appearance: "light", highContrast: false, canvas: "#F4F6FA", canvasInset: "#E9EDF5", accent: "#2C6BED", auroraA: "#C9D9F5", auroraB: "#DCE6F7", auroraC: "#EAD9F2", textPrimary: "#12182A" },
  { id: "cyber-command", appearance: "dark", highContrast: false, canvas: "#04070A", canvasInset: "#06101A", accent: "#00E5A0", auroraA: "#06304A", auroraB: "#00584A", auroraC: "#0B2036", textPrimary: "#DFF7F0" },
  { id: "minimal-productivity", appearance: "dark", highContrast: false, canvas: "#111213", canvasInset: "#171819", accent: "#B7BDC4", auroraA: "#1A1C1E", auroraB: "#202325", auroraC: "#161819", textPrimary: "#E8EAEC" },
  { id: "high-contrast", appearance: "dark", highContrast: true, canvas: "#000000", canvasInset: "#000000", accent: "#FFD400", auroraA: "#000000", auroraB: "#000000", auroraC: "#000000", textPrimary: "#FFFFFF" },
];

function loadThemes() {
  const source = path.join(ROOT, "packages/schemas/src/themes.ts");
  try {
    const text = fs.readFileSync(source, "utf8");
    const body = text.slice(text.indexOf("export const themes"));
    const themes = [];
    let current = null;
    const pairs = /(\w+)\s*:\s*(?:"([^"]*)"|(true|false))/g;
    let match;
    while ((match = pairs.exec(body)) !== null) {
      const [, key, stringValue, booleanValue] = match;
      if (key === "id") {
        current = { id: stringValue };
        themes.push(current);
        continue;
      }
      if (!current) continue;
      current[key] = booleanValue === undefined ? stringValue : booleanValue === "true";
    }
    const usable = themes.filter((theme) => theme.canvas && theme.accent && theme.auroraA);
    if (usable.length >= 1) {
      process.stdout.write(`  using ${usable.length} theme(s) from packages/schemas/src/themes.ts\n`);
      return usable;
    }
  } catch {
    /* fall through to the built-in palette */
  }
  process.stdout.write("  themes.ts unreadable — using the built-in palette\n");
  return FALLBACK_THEMES;
}

/* -------------------------------------------------------------------------- */
/* The Nexus mark                                                              */
/* -------------------------------------------------------------------------- */

const TAU = Math.PI * 2;

/**
 * Geometry of the mark, in units where 1.0 is the mark radius.
 * Six outer nodes on a hexagon, three inner nodes on the alternate axes, one
 * bright core. Beams connect core → inner → outer, and a broken hexagonal orbit
 * ring encircles everything.
 */
function markGeometry() {
  const nodes = [];
  const beams = [];

  const outer = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = -Math.PI / 2 + (i * TAU) / 6;
    // Alternating radii give the silhouette a deliberate rhythm instead of a
    // mechanical hexagon.
    const radius = i % 2 === 0 ? 1.0 : 0.86;
    outer.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, angle, major: i % 2 === 0 });
  }

  const inner = [];
  for (let i = 0; i < 3; i += 1) {
    const angle = -Math.PI / 2 + (i * TAU) / 3 + TAU / 12;
    inner.push({ x: Math.cos(angle) * 0.44, y: Math.sin(angle) * 0.44, angle });
  }

  nodes.push({ x: 0, y: 0, r: 0.135, core: true });
  for (const node of inner) nodes.push({ x: node.x, y: node.y, r: 0.062, core: false });
  for (const node of outer) nodes.push({ x: node.x, y: node.y, r: node.major ? 0.078 : 0.05, core: false });

  for (const node of inner) beams.push({ a: { x: 0, y: 0 }, b: node, w: 0.030 });
  for (let i = 0; i < 3; i += 1) {
    beams.push({ a: inner[i], b: outer[(i * 2) % 6], w: 0.024 });
    beams.push({ a: inner[i], b: outer[(i * 2 + 1) % 6], w: 0.024 });
  }
  // The orbit: all six hexagon edges, drawn thin. Keeping the ring closed holds
  // the three-fold symmetry of the whole figure, which is what makes it read as
  // designed rather than scattered.
  for (let i = 0; i < 6; i += 1) {
    beams.push({ a: outer[i], b: outer[(i + 1) % 6], w: 0.015 });
  }

  return { nodes, beams, outer, inner };
}

const MARK = markGeometry();

/**
 * Paint the mark centred at (cx, cy) with the given radius.
 * `palette` is [nearColour, midColour, farColour] sampled along the diagonal, so
 * the strokes carry a gradient rather than one flat tint.
 */
function drawMark(surface, cx, cy, radius, palette, options = {}) {
  const glowStrength = options.glow ?? 0.55;
  const softness = options.softness ?? Math.max(1, radius * 0.004);
  const alpha = options.alpha ?? 1;

  const pad = radius * 0.55;
  const x0 = Math.max(0, Math.floor(cx - radius - pad));
  const x1 = Math.min(surface.width, Math.ceil(cx + radius + pad));
  const y0 = Math.max(0, Math.floor(cy - radius - pad));
  const y1 = Math.min(surface.height, Math.ceil(cy + radius + pad));

  const toPixel = (point) => ({ x: cx + point.x * radius, y: cy + point.y * radius });
  const beams = MARK.beams.map((beam) => ({ a: toPixel(beam.a), b: toPixel(beam.b), w: beam.w * radius }));
  const nodes = MARK.nodes.map((node) => ({ ...toPixel(node), r: node.r * radius, core: node.core }));

  const stops = [
    { at: 0, color: palette[0] },
    { at: 0.52, color: palette[1] },
    { at: 1, color: palette[2] },
  ];

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      let distance = Infinity;
      for (const beam of beams) {
        const d = segmentDistance(x + 0.5, y + 0.5, beam.a.x, beam.a.y, beam.b.x, beam.b.y) - beam.w / 2;
        if (d < distance) distance = d;
      }
      let coreDistance = Infinity;
      for (const node of nodes) {
        const d = Math.hypot(x + 0.5 - node.x, y + 0.5 - node.y) - node.r;
        if (d < distance) distance = d;
        if (node.core && d < coreDistance) coreDistance = d;
      }

      if (distance > radius * 0.5) continue;

      // Gradient parameter runs along the top-left → bottom-right diagonal.
      const t = clamp(((x - cx) / radius + (y - cy) / radius + 2) / 4);
      const color = gradient(stops, t);

      const cover = coverage(distance, softness) * alpha;
      if (cover > 0.002) surface.blend(x, y, color, cover);

      if (glowStrength > 0 && distance > -softness) {
        const falloff = Math.exp(-Math.max(distance, 0) / (radius * 0.075));
        if (falloff > 0.004) surface.addLight(x, y, color, falloff * glowStrength * 0.5 * alpha);
      }
      if (coreDistance < radius * 0.30) {
        const halo = Math.exp(-Math.max(coreDistance, 0) / (radius * 0.10));
        surface.addLight(x, y, palette[1], halo * 0.30 * alpha);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Shared painting helpers                                                     */
/* -------------------------------------------------------------------------- */

function roundedRectDistance(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  const inside = x >= left && x <= right && y >= top && y <= bottom;
  const d = Math.hypot(x - cx, y - cy) - radius;
  return inside ? Math.min(d, 0) === 0 ? d : d : Math.max(d, 0);
}

/** A soft elliptical light source, warped by noise so it never looks like a blur circle. */
function auroraAt(x, y, width, height, blob) {
  const nx = x / width;
  const ny = y / height;
  const warp = blob.warp
    ? (fractalNoise(nx * blob.warpScale, ny * blob.warpScale, blob.seed, 3) - 0.5) * blob.warp
    : 0;
  const dx = (nx - blob.x + warp) / blob.rx;
  const dy = (ny - blob.y - warp * 0.6) / blob.ry;
  const d = Math.hypot(dx, dy);
  return Math.pow(1 - smoothstep(0, 1, clamp(d)), blob.falloff ?? 2);
}

function grainAt(x, y, seed, amount) {
  return (hash2(x, y, seed) - 0.5) * amount;
}

/* -------------------------------------------------------------------------- */
/* 1. Application icon                                                         */
/* -------------------------------------------------------------------------- */

const ICON_MASTER = 2048; // rendered once, box-downsampled to every shipped size

const ICON_SIZES = [
  { file: "icon_16x16.png", size: 16 },
  { file: "icon_16x16@2x.png", size: 32 },
  { file: "icon_32x32.png", size: 32 },
  { file: "icon_32x32@2x.png", size: 64 },
  { file: "icon_128x128.png", size: 128 },
  { file: "icon_128x128@2x.png", size: 256 },
  { file: "icon_256x256.png", size: 256 },
  { file: "icon_256x256@2x.png", size: 512 },
  { file: "icon_512x512.png", size: 512 },
  { file: "icon_512x512@2x.png", size: 1024 },
];

function renderIcon() {
  const size = ICON_MASTER;
  const surface = new Surface(size, size);
  const centre = size / 2;

  // macOS icon grid: the squircle occupies roughly 80% of the canvas.
  const halfWidth = size * 0.4023;
  const edge = size * 0.0016;

  const base = [
    { at: 0.0, color: hex("#1A2B4A") },
    { at: 0.34, color: hex("#101B31") },
    { at: 0.72, color: hex("#080D18") },
    { at: 1.0, color: hex("#04070E") },
  ];

  const accent = hex("#4CC9F0");
  const violet = hex("#7C5CFF");
  const teal = hex("#2BE0C8");

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = squircleDistance(x + 0.5, y + 0.5, centre, centre, halfWidth);
      const cover = coverage(d, size * 0.0022);
      if (cover <= 0.001) continue;

      const ny = y / size;
      const nx = x / size;
      let color = gradient(base, smoothstep(0, 1, ny * 0.86 + nx * 0.14));

      // Aurora light source, upper left, warm violet into cyan.
      const auroraA = auroraAt(x, y, size, size, { x: 0.24, y: 0.20, rx: 0.62, ry: 0.58, seed: 11, warp: 0.05, warpScale: 2.4, falloff: 2.2 });
      color = mix(color, mix(violet, accent, 0.45), auroraA * 0.42);

      // Second, cooler pool bottom right keeps the icon from looking top-lit only.
      const auroraB = auroraAt(x, y, size, size, { x: 0.82, y: 0.86, rx: 0.55, ry: 0.5, seed: 29, warp: 0.04, warpScale: 3.1, falloff: 2.6 });
      color = mix(color, mix(teal, hex("#0E7490"), 0.5), auroraB * 0.22);

      // Diagonal sheen: a single, wide, low-contrast band.
      const sheen = Math.exp(-Math.pow((nx + ny - 0.72) / 0.30, 2)) * 0.055;
      color = [color[0] + sheen, color[1] + sheen, color[2] + sheen, 1];

      // Rim: a bright inner hairline at the top, dark at the bottom.
      const rim = smoothstep(-size * 0.012, 0, d);
      const rimLight = rim * (1 - ny) * 0.55;
      const rimDark = rim * ny * 0.45;
      color = mix(color, [1, 1, 1, 1], rimLight * 0.35);
      color = mix(color, [0, 0, 0, 1], rimDark * 0.5);

      const grain = grainAt(x, y, 7, 0.012);
      surface.blend(x, y, [clamp(color[0] + grain), clamp(color[1] + grain), clamp(color[2] + grain), 1], cover);

      // A crisp 1px outer contour so the icon holds its shape on light desktops.
      const contour = coverage(Math.abs(d + edge) - edge, size * 0.0022) * 0.30;
      if (contour > 0.002) surface.blend(x, y, [0.62, 0.78, 0.95, 1], contour * (1 - ny * 0.7));
    }
  }

  drawMark(surface, centre, centre * 0.985, size * 0.238, [accent, mix(accent, violet, 0.55), violet], {
    glow: 0.85,
    softness: size * 0.0018,
  });

  return surface;
}

function buildIcons() {
  process.stdout.write("\nApplication icon\n");
  const master = renderIcon();
  write("icons/nexus-icon-1024.png", master.resize(1024, 1024).toPNG());

  // Cache one resize per distinct pixel size; several iconset entries share sizes.
  const cache = new Map();
  for (const { file, size } of ICON_SIZES) {
    if (!cache.has(size)) cache.set(size, master.resize(size, size).toPNG());
    write(`icons/NexusOS.iconset/${file}`, cache.get(size));
  }

  const iconutil = [
    "#!/bin/bash",
    "# Generated by scripts/generate-assets.mjs — macOS only.",
    "# iconutil ships with the Apple Command Line Tools; there is no Linux equivalent,",
    "# so this step runs on the user's Mac (PACKAGE_NEXUS.command calls it for you).",
    "set -euo pipefail",
    'cd "$(dirname "$0")"',
    "iconutil --convert icns --output NexusOS.icns NexusOS.iconset",
    'echo "Created $(pwd)/NexusOS.icns"',
    "",
  ].join("\n");
  write("icons/make-icns.sh", Buffer.from(iconutil, "utf8"));
  fs.chmodSync(path.join(ASSETS, "icons/make-icns.sh"), 0o755);
}

/* -------------------------------------------------------------------------- */
/* 2. Standalone mark                                                          */
/* -------------------------------------------------------------------------- */

function buildMark() {
  process.stdout.write("\nNexus mark\n");
  const size = 1024;

  const variants = [
    { name: "nexus-mark", palette: ["#4CC9F0", "#5FA8F5", "#7C5CFF"], glow: 0.7 },
    { name: "nexus-mark-light", palette: ["#1F6FE0", "#2C6BED", "#6B3FD4"], glow: 0.25 },
    { name: "nexus-mark-mono", palette: ["#FFFFFF", "#FFFFFF", "#FFFFFF"], glow: 0.0 },
  ];

  for (const variant of variants) {
    const surface = new Surface(size, size);
    drawMark(surface, size / 2, size / 2, size * 0.44, variant.palette.map(hex), {
      glow: variant.glow,
      softness: 1.6,
    });
    write(`brand/${variant.name}-1024.png`, surface.toPNG());
    write(`brand/${variant.name}-256.png`, surface.resize(256, 256).toPNG());
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Theme backgrounds                                                        */
/* -------------------------------------------------------------------------- */

const BACKGROUND_WIDTH = 1920;
const BACKGROUND_HEIGHT = 1200;

function renderBackground(theme) {
  const width = BACKGROUND_WIDTH;
  const height = BACKGROUND_HEIGHT;
  const surface = new Surface(width, height);

  const canvas = hex(theme.canvas ?? "#07090F");
  const inset = hex(theme.canvasInset ?? theme.canvas ?? "#0B0E17");
  const accent = hex(theme.accent ?? "#4CC9F0");
  const auroraA = hex(theme.auroraA ?? "#1B3A6B");
  const auroraB = hex(theme.auroraB ?? "#0E7490");
  const auroraC = hex(theme.auroraC ?? "#3B1E6E");
  const light = theme.appearance === "light";
  const plain = Boolean(theme.highContrast);

  // A high-contrast theme asks for no glow and no translucency. Honour that:
  // it gets a flat field and a single hairline lattice, nothing else.
  const auroraIntensity = plain ? 0 : light ? 0.85 : 1;

  const blobs = [
    { x: 0.18, y: 0.16, rx: 0.62, ry: 0.66, seed: 3, warp: 0.10, warpScale: 2.2, falloff: 2.1, color: auroraA, amount: 0.85 },
    { x: 0.86, y: 0.30, rx: 0.52, ry: 0.60, seed: 17, warp: 0.09, warpScale: 2.8, falloff: 2.4, color: auroraB, amount: 0.70 },
    { x: 0.52, y: 0.94, rx: 0.78, ry: 0.52, seed: 41, warp: 0.12, warpScale: 1.9, falloff: 2.6, color: auroraC, amount: 0.62 },
  ];

  const base = [
    { at: 0, color: light ? inset : canvas },
    { at: 0.55, color: light ? canvas : inset },
    { at: 1, color: light ? inset : canvas },
  ];

  for (let y = 0; y < height; y += 1) {
    const ny = y / height;
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      let color = gradient(base, ny * 0.82 + nx * 0.18);

      if (auroraIntensity > 0) {
        for (const blob of blobs) {
          const strength = auroraAt(x, y, width, height, blob) * blob.amount * auroraIntensity;
          if (strength > 0.002) color = mix(color, blob.color, strength * (light ? 0.55 : 0.8));
        }
      }

      // Vignette: pull the corners down (or up, on a light theme) so panels float.
      const vignette = Math.pow(Math.hypot(nx - 0.5, ny - 0.5) / 0.72, 2.1);
      color = mix(color, light ? [1, 1, 1, 1] : [0, 0, 0, 1], clamp(vignette) * (light ? 0.18 : 0.42));

      const grain = grainAt(x, y, 23, plain ? 0.004 : 0.009);
      surface.blend(x, y, [clamp(color[0] + grain), clamp(color[1] + grain), clamp(color[2] + grain), 1]);
    }
  }

  // Constellation lattice, lower right, very low contrast. Same geometry family
  // as the mark, so every theme still reads as Nexus.
  const latticeAlpha = plain ? 0.16 : light ? 0.14 : 0.20;
  drawMark(surface, width * 0.80, height * 0.72, height * 0.42, [accent, accent, accent], {
    glow: plain ? 0 : 0.18,
    softness: 1.5,
    alpha: latticeAlpha,
  });

  return surface;
}

function buildBackgrounds(themes) {
  process.stdout.write("\nTheme backgrounds\n");
  for (const theme of themes) {
    const surface = renderBackground(theme);
    write(`backgrounds/${theme.id}-background.png`, surface.toPNG());
    write(`backgrounds/${theme.id}-background-thumb.png`, surface.resize(480, 300).toPNG());
  }
}

/* -------------------------------------------------------------------------- */
/* 4. Fallback banner artwork                                                  */
/*                                                                             */
/* Shown in place of a news/article image when the remote image is missing,     */
/* blocked, or fails byte-level validation. It must never look like an error.   */
/* -------------------------------------------------------------------------- */

const BANNERS = [
  { name: "news-banner-signal", from: "#0B1B33", to: "#04070E", accent: "#4CC9F0", second: "#7C5CFF", seed: 5 },
  { name: "news-banner-ember", from: "#241405", to: "#0B0703", accent: "#E0A63C", second: "#D2593C", seed: 13 },
  { name: "news-banner-tide", from: "#04231F", to: "#03090C", accent: "#00E5A0", second: "#2C6BED", seed: 31 },
];

function renderBanner(spec) {
  const width = 1200;
  const height = 630;
  const surface = new Surface(width, height);

  const from = hex(spec.from);
  const to = hex(spec.to);
  const accent = hex(spec.accent);
  const second = hex(spec.second);

  for (let y = 0; y < height; y += 1) {
    const ny = y / height;
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      let color = mix(from, to, smoothstep(0, 1, ny * 0.7 + nx * 0.3));

      const glow = auroraAt(x, y, width, height, { x: 0.22, y: 0.32, rx: 0.6, ry: 0.9, seed: spec.seed, warp: 0.08, warpScale: 2.6, falloff: 2.2 });
      color = mix(color, accent, glow * 0.30);
      const glow2 = auroraAt(x, y, width, height, { x: 0.9, y: 0.88, rx: 0.5, ry: 0.8, seed: spec.seed + 7, warp: 0.06, warpScale: 3.2, falloff: 2.6 });
      color = mix(color, second, glow2 * 0.22);

      // Signal bars: a slow, deliberate rhythm of vertical light columns that
      // reads as "transmission" without depicting anything.
      const bar = Math.sin(nx * Math.PI * 9 + ny * 1.6);
      const barMask = Math.pow(clamp(bar), 8) * (1 - smoothstep(0.25, 1.0, ny)) * 0.09;
      color = [color[0] + accent[0] * barMask, color[1] + accent[1] * barMask, color[2] + accent[2] * barMask, 1];

      const vignette = Math.pow(Math.hypot(nx - 0.5, ny - 0.5) / 0.78, 2.2);
      color = mix(color, [0, 0, 0, 1], clamp(vignette) * 0.45);

      const grain = grainAt(x, y, spec.seed * 3, 0.014);
      surface.blend(x, y, [clamp(color[0] + grain), clamp(color[1] + grain), clamp(color[2] + grain), 1]);
    }
  }

  drawMark(surface, width * 0.5, height * 0.5, height * 0.30, [accent, mix(accent, second, 0.5), second], {
    glow: 0.5,
    softness: 1.4,
    alpha: 0.9,
  });

  return surface;
}

function buildBanners() {
  process.stdout.write("\nFallback banner artwork\n");
  for (const spec of BANNERS) {
    const surface = renderBanner(spec);
    write(`fallback/${spec.name}-1200x630.png`, surface.toPNG());
    write(`fallback/${spec.name}-600x315.png`, surface.resize(600, 315).toPNG());
  }
}

/* -------------------------------------------------------------------------- */
/* 5. Tutorial illustrations                                                   */
/*                                                                             */
/* Abstract diagrams of the thing being taught — panels, zones, connections.    */
/* No text is drawn: captions come from the tutorial content so they translate  */
/* and stay accessible.                                                        */
/* -------------------------------------------------------------------------- */

const TUTORIALS = [
  { name: "01-welcome", panels: [[0.08, 0.14, 0.42, 0.86], [0.55, 0.14, 0.92, 0.48], [0.55, 0.55, 0.92, 0.86]], focus: 0, link: true },
  { name: "02-arranging-your-space", panels: [[0.06, 0.12, 0.31, 0.88], [0.35, 0.12, 0.64, 0.52], [0.35, 0.58, 0.64, 0.88], [0.68, 0.12, 0.94, 0.88]], focus: 2, link: false },
  { name: "03-nexus-studio", panels: [[0.06, 0.12, 0.58, 0.88], [0.63, 0.12, 0.94, 0.42], [0.63, 0.48, 0.94, 0.88]], focus: 1, link: false },
  { name: "04-your-brain", panels: [[0.08, 0.16, 0.36, 0.50], [0.42, 0.12, 0.68, 0.44], [0.14, 0.58, 0.44, 0.88], [0.58, 0.52, 0.90, 0.86]], focus: 3, link: true },
  { name: "05-workflows", panels: [[0.05, 0.38, 0.24, 0.62], [0.31, 0.38, 0.50, 0.62], [0.57, 0.38, 0.76, 0.62], [0.82, 0.30, 0.96, 0.70]], focus: 3, link: true },
  { name: "06-mac-bridge", panels: [[0.06, 0.22, 0.40, 0.78], [0.60, 0.22, 0.94, 0.78]], focus: 1, link: true },
];

function renderTutorial(spec, index) {
  const width = 1280;
  const height = 720;
  const surface = new Surface(width, height);

  const accent = hex("#4CC9F0");
  const violet = hex("#7C5CFF");
  const base = [
    { at: 0, color: hex("#0C1526") },
    { at: 0.6, color: hex("#070C16") },
    { at: 1, color: hex("#04070E") },
  ];

  for (let y = 0; y < height; y += 1) {
    const ny = y / height;
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      let color = gradient(base, ny * 0.8 + nx * 0.2);
      const glow = auroraAt(x, y, width, height, { x: 0.5, y: 0.1, rx: 0.9, ry: 0.8, seed: 60 + index * 5, warp: 0.05, warpScale: 2.0, falloff: 2.4 });
      color = mix(color, mix(accent, violet, 0.5), glow * 0.16);
      const grain = grainAt(x, y, 90 + index, 0.010);
      surface.blend(x, y, [clamp(color[0] + grain), clamp(color[1] + grain), clamp(color[2] + grain), 1]);
    }
  }

  const rects = spec.panels.map(([l, t, r, b]) => ({
    left: l * width,
    top: t * height,
    right: r * width,
    bottom: b * height,
  }));

  const radius = Math.min(width, height) * 0.035;

  rects.forEach((rect, panelIndex) => {
    const focused = panelIndex === spec.focus;
    const pad = radius * 3;
    for (let y = Math.max(0, Math.floor(rect.top - pad)); y < Math.min(height, Math.ceil(rect.bottom + pad)); y += 1) {
      for (let x = Math.max(0, Math.floor(rect.left - pad)); x < Math.min(width, Math.ceil(rect.right + pad)); x += 1) {
        const d = roundedRectDistance(x + 0.5, y + 0.5, rect.left, rect.top, rect.right, rect.bottom, radius);
        const inside = coverage(d, 1.6);
        if (inside > 0.002) {
          const ny = (y - rect.top) / Math.max(1, rect.bottom - rect.top);
          const fill = mix(hex("#16203440"), hex("#0C1524C0"), ny);
          surface.blend(x, y, [fill[0], fill[1], fill[2], 0.92], inside);
          if (focused) {
            const tint = mix(accent, violet, ny);
            surface.blend(x, y, [tint[0], tint[1], tint[2], 0.14], inside);
          }
        }
        const border = coverage(Math.abs(d) - 1.2, 1.6);
        if (border > 0.002) {
          const strokeColor = focused ? mix(accent, violet, (y - rect.top) / height) : hex("#2A3852");
          surface.blend(x, y, [strokeColor[0], strokeColor[1], strokeColor[2], focused ? 0.95 : 0.7], border);
        }
        if (focused && d > 0 && d < radius * 2.4) {
          surface.addLight(x, y, accent, Math.exp(-d / (radius * 0.8)) * 0.18);
        }
      }
    }
  });

  if (spec.link) {
    // Connective beams between panel centres — the same visual grammar as the mark.
    for (let i = 0; i + 1 < rects.length; i += 1) {
      const a = { x: (rects[i].left + rects[i].right) / 2, y: (rects[i].top + rects[i].bottom) / 2 };
      const b = { x: (rects[i + 1].left + rects[i + 1].right) / 2, y: (rects[i + 1].top + rects[i + 1].bottom) / 2 };
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - 12));
      const x1 = Math.min(width, Math.ceil(Math.max(a.x, b.x) + 12));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - 12));
      const y1 = Math.min(height, Math.ceil(Math.max(a.y, b.y) + 12));
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const d = segmentDistance(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y) - 1.6;
          const cover = coverage(d, 1.6);
          const t = clamp((x - a.x) / Math.max(1, b.x - a.x));
          const color = mix(accent, violet, t);
          if (cover > 0.002) surface.blend(x, y, [color[0], color[1], color[2], 0.6], cover);
          if (d > 0 && d < 10) surface.addLight(x, y, color, Math.exp(-d / 3.2) * 0.12);
        }
      }
    }
  }

  drawMark(surface, width * 0.5, height * 0.5, height * 0.10, [accent, mix(accent, violet, 0.5), violet], {
    glow: 0.4,
    softness: 1.3,
    alpha: 0.55,
  });

  return surface;
}

function buildTutorials() {
  process.stdout.write("\nTutorial illustrations\n");
  TUTORIALS.forEach((spec, index) => {
    const surface = renderTutorial(spec, index);
    write(`tutorials/${spec.name}.png`, surface.toPNG());
  });
}

/* -------------------------------------------------------------------------- */
/* Manifest                                                                    */
/* -------------------------------------------------------------------------- */

function writeManifest() {
  const manifest = {
    generator: "scripts/generate-assets.mjs",
    generatedAt: new Date().toISOString(),
    licence:
      "Original artwork produced procedurally for Nexus OS. No third-party imagery, fonts or trademarks are used.",
    files: written
      .slice()
      .sort((a, b) => a.file.localeCompare(b.file))
      .map(({ file, bytes }) => ({ file, bytes })),
  };
  const buffer = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(ASSETS, "manifest.json"), buffer);
  process.stdout.write(`  wrote assets/manifest.json (${written.length} files)\n`);
}

/* -------------------------------------------------------------------------- */

function main() {
  const started = Date.now();
  process.stdout.write("Nexus OS — generating original branding\n");
  const themes = loadThemes();

  if (!only || only === "icons") buildIcons();
  if (!only || only === "mark") buildMark();
  if (!only || only === "themes") buildBackgrounds(themes);
  if (!only || only === "banners") buildBanners();
  if (!only || only === "tutorials") buildTutorials();

  writeManifest();

  const totalBytes = written.reduce((sum, entry) => sum + entry.bytes, 0);
  process.stdout.write(
    `\nDone: ${written.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MB, in ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
  );
  if (!only || only === "icons") {
    process.stdout.write(
      "\nmacOS only — turn the iconset into an .icns (PACKAGE_NEXUS.command does this for you):\n" +
        "  iconutil --convert icns --output assets/icons/NexusOS.icns assets/icons/NexusOS.iconset\n",
    );
  }
}

main();
