import { NexusError } from "./errors.js";

/**
 * Validates media before it is cached, stored or displayed. Applies to uploaded
 * images, remote banners, theme packs and plugin icons.
 *
 * Port of `MediaValidator` in apps/mac-bridge/Sources/SecurityCore/FileSafety.swift.
 * The format is decided by the file's own bytes; `Content-Type` and the file
 * extension are treated as claims, never as facts.
 */

export type ImageFormat = "png" | "jpeg" | "gif" | "webp";

export const IMAGE_MIME_TYPES: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export const IMAGE_EXTENSIONS: Record<ImageFormat, string> = {
  png: "png",
  jpeg: "jpg",
  gif: "gif",
  webp: "webp",
};

export type AudioFormat = "wav" | "mp3" | "m4a" | "flac" | "aiff";

function startsWith(bytes: Uint8Array, pattern: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + pattern.length) return false;
  for (let index = 0; index < pattern.length; index += 1) {
    if (bytes[offset + index] !== pattern[index]) return false;
  }
  return true;
}

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

/** Identifies the format from the file's own bytes. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  return null;
}

/**
 * Scans the leading bytes for markup that would execute if the file were ever
 * handed to a web view. Works directly on bytes, so a polyglot file that begins
 * with a valid PNG header is still caught and no text decoding can fail.
 */
export function containsScriptMarkup(bytes: Uint8Array, scanBytes = 4096): boolean {
  const window = bytes.subarray(0, scanBytes);
  const lowered = new Uint8Array(window.length);
  for (let index = 0; index < window.length; index += 1) {
    const byte = window[index]!;
    lowered[index] = byte >= 0x41 && byte <= 0x5a ? byte + 32 : byte;
  }
  const needles = ["<script", "<svg", "<!doctype html", "<html", "javascript:", "<iframe", "onerror="];
  return needles.some((needle) => {
    const pattern = ascii(needle);
    if (lowered.length < pattern.length) return false;
    for (let start = 0; start <= lowered.length - pattern.length; start += 1) {
      if (startsWith(lowered, pattern, start)) return true;
    }
    return false;
  });
}

export interface MediaValidatorOptions {
  maximumBytes?: number;
  maximumAudioBytes?: number;
}

export class MediaValidator {
  readonly maximumBytes: number;
  readonly maximumAudioBytes: number;

  constructor(options: MediaValidatorOptions = {}) {
    this.maximumBytes = options.maximumBytes ?? 8 * 1024 * 1024;
    this.maximumAudioBytes = options.maximumAudioBytes ?? 5 * 1024 * 1024;
  }

  validateImage(bytes: Uint8Array, declaredMIME?: string | null): ImageFormat {
    if (bytes.length === 0) {
      throw NexusError.validation(
        "emptyImage",
        "The image file is empty.",
        "Choose a different image, or use the built-in artwork.",
      );
    }
    if (bytes.length > this.maximumBytes) {
      throw NexusError.validation(
        "imageTooLarge",
        `That image is larger than the ${Math.floor(this.maximumBytes / 1024 / 1024)} MB limit.`,
        "Use a smaller image, or reduce its resolution before adding it.",
      );
    }
    const format = detectImageFormat(bytes);
    if (!format) {
      throw NexusError.security(
        "unknownImageFormat",
        "That file is not a PNG, JPEG, GIF or WebP image.",
        "Nexus OS only displays standard image formats. Convert the file, or pick another image.",
      );
    }
    // SVG and HTML can carry script. They are refused outright, including when a
    // server mislabels them as an image.
    const declared = declaredMIME?.toLowerCase();
    if (declared && (declared.includes("svg") || declared.includes("html") || declared.includes("xml"))) {
      throw NexusError.security(
        "scriptableImageType",
        "That address returned a document rather than a picture.",
        "Use a direct link to a PNG or JPEG image.",
      );
    }
    if (containsScriptMarkup(bytes)) {
      throw NexusError.security(
        "scriptInImage",
        "That image file contains embedded web code and was rejected.",
        "Use a different image. This can indicate a tampered or unsafe file.",
      );
    }
    return format;
  }

  /** Audio for the sale sound and UI feedback. Same principle: sniff, don't trust. */
  validateAudio(bytes: Uint8Array): AudioFormat {
    if (bytes.length > this.maximumAudioBytes) {
      throw NexusError.validation(
        "audioTooLarge",
        "That sound file is too large.",
        `Choose a file under ${Math.floor(this.maximumAudioBytes / 1024 / 1024)} MB.`,
      );
    }
    if (bytes.length < 12) {
      throw NexusError.validation(
        "audioUnreadable",
        "That sound file could not be read.",
        "Choose a different file.",
      );
    }
    if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WAVE"), 8)) return "wav";
    if (startsWith(bytes, ascii("ftyp"), 4)) return "m4a";
    if (startsWith(bytes, [0x49, 0x44, 0x33])) return "mp3";
    if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "mp3";
    if (startsWith(bytes, ascii("fLaC"))) return "flac";
    if (startsWith(bytes, ascii("FORM"))) return "aiff";
    throw NexusError.security(
      "unknownAudioFormat",
      "That file is not a recognised sound format.",
      "Use a WAV, MP3, M4A, AIFF or FLAC file.",
    );
  }
}

export const mediaValidator = new MediaValidator();

/**
 * Names an uploaded file safely. Path separators, traversal and control
 * characters are removed before the name ever reaches the filesystem.
 */
export function safeFileName(candidate: string, format: ImageFormat): string {
  const base = candidate
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\]/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 80);
  const stem = base.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "image";
  return `${stem}.${IMAGE_EXTENSIONS[format]}`;
}
