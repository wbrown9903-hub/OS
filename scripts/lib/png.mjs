/**
 * A minimal, dependency-free PNG encoder plus the small drawing surface the
 * Nexus asset generator paints on.
 *
 * Why this exists: the build machine has no native image libraries and we will
 * not add a binary dependency to produce our own branding. Everything here is
 * plain JavaScript over `node:zlib`, which ships with Node.
 *
 * Colour model: straight (non-premultiplied) alpha, linear-ish sRGB values kept
 * as floats in 0..1 until the final quantisation to 8-bit.
 */

import zlib from "node:zlib";

/* -------------------------------------------------------------------------- */
/* PNG container                                                               */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * Adaptive per-scanline filtering (the standard "minimum sum of absolute
 * differences" heuristic). Smooth gradients compress dramatically better with
 * Up/Paeth filtering than with no filter at all.
 */
function filterScanlines(rgba, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel;
  const out = Buffer.alloc((stride + 1) * height);
  const previous = Buffer.alloc(stride);
  const candidates = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];

  for (let y = 0; y < height; y += 1) {
    const row = rgba.subarray(y * stride, y * stride + stride);

    for (let x = 0; x < stride; x += 1) {
      const raw = row[x];
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;

      candidates[0][x] = raw;
      candidates[1][x] = (raw - left) & 0xff;
      candidates[2][x] = (raw - up) & 0xff;
      candidates[3][x] = (raw - ((left + up) >> 1)) & 0xff;

      const p = left + up - upLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - upLeft);
      const paeth = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      candidates[4][x] = (raw - paeth) & 0xff;
    }

    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f += 1) {
      let score = 0;
      const candidate = candidates[f];
      for (let x = 0; x < stride; x += 1) {
        const value = candidate[x];
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }

    const offset = y * (stride + 1);
    out[offset] = best;
    candidates[best].copy(out, offset + 1);
    row.copy(previous, 0);
  }

  return out;
}

/** Encode 8-bit RGBA pixel data as a PNG buffer. */
export function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const filtered = filterScanlines(rgba, width, height, 4);
  const compressed = zlib.deflateSync(filtered, { level: 9, memLevel: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Colour                                                                      */
/* -------------------------------------------------------------------------- */

export function hex(value) {
  const text = value.replace("#", "");
  const full = text.length === 3 ? text.split("").map((c) => c + c).join("") : text;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
    full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
  ];
}

export const clamp = (value, low = 0, high = 1) => (value < low ? low : value > high ? high : value);
export const lerp = (a, b, t) => a + (b - a) * t;

export function mix(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3] ?? 1, b[3] ?? 1, t)];
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Sample a gradient described as [{ at: 0..1, color: [r,g,b,a] }, …]. */
export function gradient(stops, t) {
  const position = clamp(t);
  if (position <= stops[0].at) return stops[0].color;
  for (let i = 1; i < stops.length; i += 1) {
    const previous = stops[i - 1];
    const current = stops[i];
    if (position <= current.at) {
      const span = current.at - previous.at || 1;
      const local = (position - previous.at) / span;
      return mix(previous.color, current.color, smoothstep(0, 1, local));
    }
  }
  return stops[stops.length - 1].color;
}

/* -------------------------------------------------------------------------- */
/* Deterministic value noise — the grain that keeps flat gradients from banding */
/* -------------------------------------------------------------------------- */

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function valueNoise(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(0, 1, x - x0);
  const fy = smoothstep(0, 1, y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

export function fractalNoise(x, y, seed = 0, octaves = 4) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * frequency, y * frequency, seed + i * 97) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

/* -------------------------------------------------------------------------- */
/* Drawing surface                                                             */
/* -------------------------------------------------------------------------- */

export class Surface {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Float32Array(width * height * 4);
  }

  /** Source-over composite of a straight-alpha colour at one pixel. */
  blend(x, y, color, coverage = 1) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const alpha = (color[3] ?? 1) * coverage;
    if (alpha <= 0) return;
    const i = (y * this.width + x) * 4;
    const dstA = this.data[i + 3];
    const outA = alpha + dstA * (1 - alpha);
    if (outA <= 0) {
      this.data[i] = 0;
      this.data[i + 1] = 0;
      this.data[i + 2] = 0;
      this.data[i + 3] = 0;
      return;
    }
    for (let c = 0; c < 3; c += 1) {
      this.data[i + c] = (color[c] * alpha + this.data[i + c] * dstA * (1 - alpha)) / outA;
    }
    this.data[i + 3] = outA;
  }

  /** Additive light — used for glows, which should never darken what is under them. */
  addLight(x, y, color, amount) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || amount <= 0) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = clamp(this.data[i] + color[0] * amount, 0, 4);
    this.data[i + 1] = clamp(this.data[i + 1] + color[1] * amount, 0, 4);
    this.data[i + 2] = clamp(this.data[i + 2] + color[2] * amount, 0, 4);
    this.data[i + 3] = clamp(this.data[i + 3] + amount, 0, 1);
  }

  /** Paint every pixel through a callback returning [r,g,b,a] or null. */
  paint(fn) {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const color = fn(x, y);
        if (color) this.blend(x, y, color);
      }
    }
  }

  /** Box-downsample to a new size. Averaging is done in straight alpha space. */
  resize(targetWidth, targetHeight) {
    const out = new Surface(targetWidth, targetHeight);
    const scaleX = this.width / targetWidth;
    const scaleY = this.height / targetHeight;
    for (let y = 0; y < targetHeight; y += 1) {
      const y0 = Math.floor(y * scaleY);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));
      for (let x = 0; x < targetWidth; x += 1) {
        const x0 = Math.floor(x * scaleX);
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        for (let sy = y0; sy < y1 && sy < this.height; sy += 1) {
          for (let sx = x0; sx < x1 && sx < this.width; sx += 1) {
            const i = (sy * this.width + sx) * 4;
            const alpha = this.data[i + 3];
            // Weight colour by alpha so transparent pixels do not wash out edges.
            r += this.data[i] * alpha;
            g += this.data[i + 1] * alpha;
            b += this.data[i + 2] * alpha;
            a += alpha;
            count += 1;
          }
        }
        if (count === 0) continue;
        const o = (y * targetWidth + x) * 4;
        const alphaAverage = a / count;
        if (a > 0) {
          out.data[o] = r / a;
          out.data[o + 1] = g / a;
          out.data[o + 2] = b / a;
        }
        out.data[o + 3] = alphaAverage;
      }
    }
    return out;
  }

  /**
   * Quantise to 8-bit RGBA. A ±0.5/255 ordered dither is applied so wide, smooth
   * gradients do not band on a real display.
   */
  toRGBA() {
    const out = Buffer.alloc(this.width * this.height * 4);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const i = (y * this.width + x) * 4;
        const dither = (hash2(x, y, 0x5eed) - 0.5) / 255;
        for (let c = 0; c < 3; c += 1) {
          out[i + c] = Math.round(clamp(this.data[i + c] + dither) * 255);
        }
        out[i + 3] = Math.round(clamp(this.data[i + 3]) * 255);
      }
    }
    return out;
  }

  toPNG() {
    return encodePNG(this.width, this.height, this.toRGBA());
  }
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers used by the art direction                                  */
/* -------------------------------------------------------------------------- */

/** Signed distance to a superellipse ("squircle") — the macOS icon silhouette. */
export function squircleDistance(x, y, cx, cy, radius, exponent = 4.6) {
  const dx = Math.abs(x - cx) / radius;
  const dy = Math.abs(y - cy) / radius;
  const value = Math.pow(Math.pow(dx, exponent) + Math.pow(dy, exponent), 1 / exponent);
  return (value - 1) * radius;
}

/** Signed distance from a point to a line segment. */
export function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared === 0 ? 0 : clamp((wx * vx + wy * vy) / lengthSquared);
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return Math.hypot(dx, dy);
}

/** Antialiased coverage from a signed distance, feathered over `softness` px. */
export function coverage(distance, softness = 1) {
  return 1 - smoothstep(-softness / 2, softness / 2, distance);
}
