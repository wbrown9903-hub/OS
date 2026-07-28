/**
 * Narrow local port of the `@nexus/security` contract.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `packages/security` is owned by another agent and its `src/` was empty when
 * this package was written, so a static `import … from "@nexus/security"` would
 * not resolve at type-check or test time. Rather than reach into someone else's
 * package, this module declares the *exact* surface the integrations need and
 * implements it conservatively. When `@nexus/security` ships these exports this
 * file becomes a one-line re-export — nothing else in the package changes,
 * because every call site imports from here and never from a crypto primitive
 * directly.
 *
 * The surface required from `@nexus/security` is:
 *   redactSecrets, redactObject, validateOutboundUrl, validateLocalServiceUrl,
 *   verifyHmacSha256Base64, timingSafeEquals, sniffImage.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/* -------------------------------------------------------------------------- */
/* Redaction                                                                   */
/* -------------------------------------------------------------------------- */

/** Key names whose *values* are always replaced, whatever they look like. */
const SECRET_KEY_PATTERN =
  /(pass(word)?|secret|token|api[-_]?key|apikey|authorization|auth|credential|cookie|session|private[-_]?key|access[-_]?token|refresh[-_]?token|signature|hmac|seed|mnemonic|passphrase)/i;

/** Value shapes that are secret wherever they appear, including inside prose. */
const SECRET_VALUE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /shp(at|ca|pa|ss)_[A-Za-z0-9]{16,}/g, label: "shopify token" },
  { pattern: /sk-ant-[A-Za-z0-9_\-]{16,}/g, label: "anthropic key" },
  { pattern: /sk-(proj-)?[A-Za-z0-9_\-]{20,}/g, label: "openai key" },
  { pattern: /gh[pousr]_[A-Za-z0-9]{16,}/g, label: "github token" },
  { pattern: /xox[abprs]-[A-Za-z0-9\-]{10,}/g, label: "slack token" },
  { pattern: /Bearer\s+[A-Za-z0-9._\-]{12,}/gi, label: "bearer token" },
  { pattern: /Basic\s+[A-Za-z0-9+/=]{12,}/gi, label: "basic credential" },
  { pattern: /eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}/g, label: "jwt" },
  // WordPress application passwords are printed as five groups of four.
  { pattern: /\b[A-Za-z0-9]{4}(\s[A-Za-z0-9]{4}){5}\b/g, label: "application password" },
];

export const REDACTED = "[redacted]";

/** Replaces anything that looks like credential material in a string. */
export function redactSecrets(input: string): string {
  let output = input;
  for (const { pattern } of SECRET_VALUE_PATTERNS) {
    output = output.replace(new RegExp(pattern.source, pattern.flags), REDACTED);
  }
  // `key=value` and `"key": "value"` forms where the *key* names a secret.
  output = output.replace(
    /("?[A-Za-z0-9_\-]*(?:pass(?:word)?|secret|token|key|authorization|credential|signature|hmac)"?)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&}]+)/gi,
    (whole, key: string, sep: string) => (SECRET_KEY_PATTERN.test(key) ? `${key}${sep}${REDACTED}` : whole),
  );
  return output;
}

/**
 * Deep-redacts a value for logging. Secret-named keys lose their value entirely;
 * strings elsewhere are still pattern-scanned. Cycles are tolerated.
 */
export function redactObject(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[circular]";
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((entry) => redactObject(entry, seen));
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redactObject(entry, seen);
  }
  return output;
}

/** Convenience for log lines: redacted JSON that never throws. */
export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(redactObject(value)) ?? "null";
  } catch {
    return '"[unserialisable]"';
  }
}

/* -------------------------------------------------------------------------- */
/* URL validation                                                              */
/* -------------------------------------------------------------------------- */

export interface UrlRejection {
  ok: false;
  code:
    | "malformed"
    | "schemeNotAllowed"
    | "privateAddress"
    | "metadataAddress"
    | "credentialsInUrl"
    | "hostNotAllowed";
  message: string;
  nextStep: string;
}

export type UrlCheck = { ok: true; url: URL } | UrlRejection;

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // carrier-grade NAT
];

const LOCAL_SUFFIXES = [".local", ".internal", ".localdomain", ".home.arpa", ".lan"];

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function normalisedHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "::1" || h === "0.0.0.0" || h === "::") return true;
  if (LOCAL_SUFFIXES.some((suffix) => h.endsWith(suffix))) return true;
  if (isIpv4(h)) return PRIVATE_V4.some((pattern) => pattern.test(h));
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;
  return false;
}

export function isMetadataHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "169.254.169.254" ||
    h === "metadata.google.internal" ||
    h === "metadata.goog" ||
    h === "fd00:ec2::254" ||
    h.startsWith("169.254.170.")
  );
}

/**
 * The policy for anything Nexus fetches from the public internet: https only,
 * no embedded credentials, no private or metadata address.
 */
export function validateOutboundUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      code: "malformed",
      message: "That web address could not be understood.",
      nextStep: "Check it starts with https:// and has no typos.",
    };
  }
  if (url.protocol !== "https:") {
    return {
      ok: false,
      code: "schemeNotAllowed",
      message: `Nexus only fetches over https, and that address uses “${url.protocol.replace(":", "")}”.`,
      nextStep: "Use the https:// version of the address.",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      code: "credentialsInUrl",
      message: "That address contains a username or password.",
      nextStep: "Remove the credentials from the address and store them as a connection secret instead.",
    };
  }
  const host = normalisedHost(url);
  if (isMetadataHost(host)) {
    return {
      ok: false,
      code: "metadataAddress",
      message: "That address points at a cloud metadata service, which is never allowed.",
      nextStep: "Use the public address of the service you meant.",
    };
  }
  if (isPrivateHost(host)) {
    return {
      ok: false,
      code: "privateAddress",
      message: "That address points at a private or local network.",
      nextStep: "Use a public https address, or add it as a local service if it is your own site.",
    };
  }
  return { ok: true, url };
}

/**
 * The relaxed policy for a service the user has explicitly declared to be on
 * their own machine or LAN — a self-hosted WordPress at http://192.168.1.20,
 * or an OpenAI-compatible model server at http://localhost:11434.
 *
 * Still refuses `javascript:`, `data:`, `file:` and cloud metadata, and still
 * refuses a *public* http address (that would be plaintext credentials on the
 * open internet).
 */
export function validateLocalServiceUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      code: "malformed",
      message: "That web address could not be understood.",
      nextStep: "Check it looks like http://192.168.1.20 or https://example.com.",
    };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      ok: false,
      code: "schemeNotAllowed",
      message: `“${url.protocol.replace(":", "")}” addresses are never opened by Nexus.`,
      nextStep: "Use an http:// or https:// address.",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      code: "credentialsInUrl",
      message: "That address contains a username or password.",
      nextStep: "Remove them from the address; Nexus stores credentials separately and encrypted.",
    };
  }
  const host = normalisedHost(url);
  if (isMetadataHost(host)) {
    return {
      ok: false,
      code: "metadataAddress",
      message: "That address points at a cloud metadata service, which is never allowed.",
      nextStep: "Use the address of your own site instead.",
    };
  }
  if (url.protocol === "http:" && !isPrivateHost(host)) {
    return {
      ok: false,
      code: "schemeNotAllowed",
      message: "That is a public address, so http would send your password unencrypted.",
      nextStep: "Use https:// for a site on the public internet.",
    };
  }
  return { ok: true, url };
}

/* -------------------------------------------------------------------------- */
/* HMAC                                                                        */
/* -------------------------------------------------------------------------- */

export function timingSafeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    // Still burn a comparison so length is the only thing leaked.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Computes the base64 HMAC-SHA256 that Shopify (and most webhooks) send. */
export function hmacSha256Base64(secret: string, body: string | Uint8Array): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

/** Constant-time verification of a base64 HMAC-SHA256 signature. */
export function verifyHmacSha256Base64(
  secret: string,
  body: string | Uint8Array,
  providedSignature: string,
): boolean {
  if (!secret || !providedSignature) return false;
  return timingSafeEquals(hmacSha256Base64(secret, body), providedSignature.trim());
}

/* -------------------------------------------------------------------------- */
/* Image byte sniffing                                                         */
/* -------------------------------------------------------------------------- */

export type SniffedImageFormat = "png" | "jpeg" | "gif" | "webp" | "avif";

export type ImageCheck =
  | { ok: true; format: SniffedImageFormat; mimeType: string; byteSize: number }
  | { ok: false; code: "empty" | "tooLarge" | "unknownFormat" | "polyglot"; message: string; nextStep: string };

/** Byte sequences that must never appear inside something we will store as an image. */
const POLYGLOT_MARKERS = [
  "<script",
  "</script",
  "<?php",
  "<!doctype html",
  "<html",
  "<svg",
  "javascript:",
  "onerror=",
  "onload=",
  "<iframe",
  "%pdf-",
];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Decides what an image really is from its bytes. `Content-Type` and the file
 * extension are ignored on purpose — both are attacker-controlled.
 */
export function sniffImage(bytes: Uint8Array, options: { maxBytes?: number } = {}): ImageCheck {
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  if (bytes.length === 0) {
    return { ok: false, code: "empty", message: "That image was empty.", nextStep: "Choose a different image." };
  }
  if (bytes.length > maxBytes) {
    return {
      ok: false,
      code: "tooLarge",
      message: `That image is larger than the ${Math.round(maxBytes / 1024)} KB limit.`,
      nextStep: "Use a smaller image, or lower the quality before uploading.",
    };
  }

  let format: SniffedImageFormat | null = null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) format = "png";
  else if (startsWith(bytes, [0xff, 0xd8, 0xff])) format = "jpeg";
  else if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) format = "gif";
  else if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) format = "webp";
  else if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4) && startsWith(bytes, [0x61, 0x76, 0x69], 8)) format = "avif";

  if (!format) {
    return {
      ok: false,
      code: "unknownFormat",
      message: "That file is not a PNG, JPEG, GIF, WebP or AVIF image.",
      nextStep: "Save it as a PNG or JPEG and try again. SVG is not accepted because it can contain code.",
    };
  }

  // A polyglot is a file that is *simultaneously* a valid image and a valid
  // script/document. The image header check above passes for those, so scan the
  // whole payload for markup markers before accepting it.
  const text = Buffer.from(bytes).toString("latin1").toLowerCase();
  const marker = POLYGLOT_MARKERS.find((needle) => text.includes(needle));
  if (marker) {
    return {
      ok: false,
      code: "polyglot",
      message: "That image also contains web page or script code, so it was rejected.",
      nextStep: "Re-export the picture from an image editor, which strips the extra content.",
    };
  }

  const mimeType =
    format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : format === "gif" ? "image/gif" : format === "webp" ? "image/webp" : "image/avif";
  return { ok: true, format, mimeType, byteSize: bytes.length };
}
