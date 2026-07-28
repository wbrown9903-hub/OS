"use client";

import { useRef, useState } from "react";
import type { ImageSourceValue } from "@nexus/schemas";
import { builtInArtwork, resolveArtwork } from "../../widgets/artwork";
import { useShell } from "../../../lib/client/shell-store";
import { apiPost } from "../../../lib/client/api";
import {
  COLOUR_TOKENS,
  altTextWarning,
  contrastWarning,
  isValidColourValue,
  readAudio,
  readImage,
  readNumber,
  readString,
  resolveColourToHex,
  themeFor,
} from "../studio-model";
import { ChoiceRow, StudioField, useTextBuffer, type ControlProps } from "./common";

/**
 * One component per property kind — part two: colour, image and sound.
 *
 * These are the kinds where a wrong choice is invisible until someone else tries
 * to use the dashboard, so each one checks itself: colours are measured against
 * WCAG AA, images insist on a description, and a remote address is refused
 * unless it is plain https.
 */

/* --- color ---------------------------------------------------------------- */

export function ColorControl({ id, definition, value, onChange }: ControlProps) {
  const shell = useShell();
  const theme = themeFor(shell.document.themeId);
  const current = readString(value, "token:accent");
  const buffer = useTextBuffer(current, (next) => {
    if (isValidColourValue(next.trim())) onChange(next.trim());
  });

  const valid = isValidColourValue(buffer.value.trim());
  const swatch = resolveColourToHex(buffer.value.trim(), theme) ?? theme.tokens.accent;
  const warning = valid ? contrastWarning(buffer.value.trim(), theme) : null;
  const usingToken = buffer.value.startsWith("token:");

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={warning}
      problem={
        valid
          ? null
          : "Use a hex colour such as #1B2A4A, or a theme colour such as token:accent so it follows whichever theme is in use."
      }
    >
      <div className="nx-studio-colour">
        <span className="nx-studio-colour__swatch" style={{ background: swatch }} aria-hidden="true" />
        <input
          id={id}
          className="nx-input"
          type="text"
          value={buffer.value}
          spellCheck={false}
          aria-invalid={valid ? undefined : "true"}
          onChange={(event) => buffer.onChange(event.target.value)}
          onBlur={buffer.onBlur}
          onKeyDown={buffer.onKeyDown}
        />
        <input
          type="color"
          className="nx-studio-colour__picker"
          aria-label={`${definition.label} — pick a colour`}
          value={/^#[0-9a-fA-F]{6}$/.test(swatch) ? swatch : "#4cc9f0"}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <div className="nx-studio-chips" role="group" aria-label="Theme colours">
        {COLOUR_TOKENS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="nx-studio-chip"
            aria-pressed={buffer.value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span
              aria-hidden="true"
              className="nx-studio-chip__dot"
              style={{ background: resolveColourToHex(option.value, theme) ?? "transparent" }}
            />
            {option.label}
          </button>
        ))}
      </div>
      {usingToken ? (
        <p className="nx-studio-hint">This colour follows the theme, so it stays readable when the theme changes.</p>
      ) : null}
    </StudioField>
  );
}

/* --- image ---------------------------------------------------------------- */

const IMAGE_MODES = [
  { value: "builtIn", label: "Built-in artwork" },
  { value: "upload", label: "Upload" },
  { value: "remoteURL", label: "Web address" },
  { value: "officialFeed", label: "Official feed" },
] as const;

export function ImageControl({ id, definition, value, onChange }: ControlProps) {
  const shell = useShell();
  const image = readImage(value);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const update = (patch: Partial<ImageSourceValue>) => onChange({ ...image, ...patch });
  const altBuffer = useTextBuffer(image.altText, (next) => update({ altText: next }));
  const urlBuffer = useTextBuffer(image.remoteURL ?? "", (next) => update({ remoteURL: next.trim() || null }));

  const preview = resolveArtwork(image);
  const remoteProblem =
    image.mode === "remoteURL" && image.remoteURL && !/^https:\/\//i.test(image.remoteURL)
      ? "Nexus OS only loads images from https addresses. Enter one that starts with https://."
      : null;

  // Feeds are discovered, never invented: only feeds this build already knows
  // about are offered, and when there are none the field says so plainly.
  const feeds = shell.connections.value
    .filter((connection) => connection.state === "connected")
    .map((connection) => ({ id: `${connection.service}-media`, label: `${connection.label} media` }));

  const chooseFile = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("read failed"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      // The server sniffs the real bytes before storing anything; the browser
      // only ever proposes a file, it never decides that it is safe.
      const result = await apiPost<{ storagePath?: string }>("/api/media/upload", {
        fileName: file.name,
        contentType: file.type,
        data: dataUrl,
      });
      if (!result.ok || !result.data.storagePath) {
        shell.toast({
          title: "That picture was not added",
          body: result.ok
            ? "The media service replied without a stored file. Try a different image."
            : `${result.problem.message} ${result.problem.nextStep}`,
          tone: "caution",
          href: result.ok ? null : result.problem.href ?? null,
        });
        return;
      }
      update({ mode: "upload", uploadPath: result.data.storagePath });
    } finally {
      setUploading(false);
    }
  };

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={altTextWarning(image)}
      problem={remoteProblem}
    >
      <div className="nx-studio-image">
        <div className="nx-studio-image__preview" aria-hidden="true">
          {preview.kind === "gradient" ? (
            <span style={{ background: preview.css }} />
          ) : preview.kind === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview.src} alt="" />
          ) : (
            <span className="nx-studio-image__pending">{preview.reason}</span>
          )}
        </div>

        <ChoiceRow
          legend="Where this picture comes from"
          value={image.mode}
          options={IMAGE_MODES}
          onChange={(mode) => update({ mode: mode as ImageSourceValue["mode"] })}
        />
      </div>

      {image.mode === "builtIn" ? (
        <div className="nx-studio-artwork" role="radiogroup" aria-label="Built-in artwork">
          {builtInArtwork.map((artwork) => (
            <button
              key={artwork.id}
              type="button"
              role="radio"
              aria-checked={image.builtInId === artwork.id}
              className="nx-studio-artwork__choice"
              onClick={() => update({ builtInId: artwork.id })}
            >
              <span aria-hidden="true" style={{ background: artwork.css }} />
              {artwork.label}
            </button>
          ))}
        </div>
      ) : null}

      {image.mode === "upload" ? (
        <div className="nx-studio-inline">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="nx-sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void chooseFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="nx-button nx-button--secondary"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? "Checking the file…" : image.uploadPath ? "Replace picture" : "Choose a picture"}
          </button>
          <span className="nx-studio-hint">
            {image.uploadPath ?? "No file has been uploaded yet. Nexus OS checks the real bytes before storing it."}
          </span>
        </div>
      ) : null}

      {image.mode === "remoteURL" ? (
        <input
          className="nx-input"
          type="url"
          placeholder="https://"
          value={urlBuffer.value}
          aria-label="Image web address"
          onChange={(event) => urlBuffer.onChange(event.target.value)}
          onBlur={urlBuffer.onBlur}
          onKeyDown={urlBuffer.onKeyDown}
        />
      ) : null}

      {image.mode === "officialFeed" ? (
        feeds.length > 0 ? (
          <select
            className="nx-select"
            aria-label="Official feed"
            value={image.feedId ?? ""}
            onChange={(event) => update({ feedId: event.target.value || null })}
          >
            <option value="">Choose a feed…</option>
            {feeds.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.label}
              </option>
            ))}
          </select>
        ) : (
          <p className="nx-studio-hint">
            No official feed is available yet. Connect a service in Settings › Connections and its artwork feed appears
            here. Until then, choose built-in artwork so the panel still has a picture.
          </p>
        )
      ) : null}

      <label className="nx-field__label" htmlFor={`${id}-alt`}>
        Description (alt text)
      </label>
      <input
        id={`${id}-alt`}
        className="nx-input"
        type="text"
        value={altBuffer.value}
        placeholder="Describe what the picture shows"
        onChange={(event) => altBuffer.onChange(event.target.value)}
        onBlur={altBuffer.onBlur}
        onKeyDown={altBuffer.onKeyDown}
      />
    </StudioField>
  );
}

/* --- audio ---------------------------------------------------------------- */

const AUDIO_MODES = [
  { value: "builtIn", label: "Built-in sound" },
  { value: "upload", label: "Your own file" },
  { value: "silent", label: "Silent" },
] as const;

/** The bundled sounds. These ids match the files shipped in `assets/sounds`. */
const BUILT_IN_SOUNDS = [
  { id: "nexus-chime", label: "Chime" },
  { id: "nexus-soft-bell", label: "Soft bell" },
  { id: "nexus-coin", label: "Coin" },
  { id: "nexus-fanfare", label: "Fanfare" },
];

export function AudioControl({ id, definition, value, onChange }: ControlProps) {
  const shell = useShell();
  const audio = readAudio(value);
  const update = (patch: Partial<typeof audio>) => onChange({ ...audio, ...patch });
  const known = BUILT_IN_SOUNDS.some((sound) => sound.id === audio.builtInId);

  const globalVolume = shell.document.preferences.soundVolume;
  const soundsOff = shell.document.preferences.soundsEnabled === false;

  return (
    <StudioField
      id={id}
      label={definition.label}
      help={definition.help}
      advanced={definition.advanced}
      caution={
        soundsOff && audio.mode !== "silent"
          ? "Sounds are switched off for the whole of Nexus OS, so this will stay quiet until you turn them back on in the Theme panel."
          : null
      }
    >
      <ChoiceRow
        legend="Sound"
        value={audio.mode}
        options={AUDIO_MODES}
        onChange={(mode) => update({ mode: mode as typeof audio.mode })}
      />

      {audio.mode === "builtIn" ? (
        <select
          id={id}
          className="nx-select"
          value={audio.builtInId}
          onChange={(event) => update({ builtInId: event.target.value })}
        >
          {known ? null : <option value={audio.builtInId}>{audio.builtInId} (set by hand)</option>}
          {BUILT_IN_SOUNDS.map((sound) => (
            <option key={sound.id} value={sound.id}>
              {sound.label}
            </option>
          ))}
        </select>
      ) : null}

      {audio.mode === "upload" ? (
        <p className="nx-studio-hint">
          {audio.uploadPath
            ? `Playing ${audio.uploadPath}.`
            : "No sound file has been added yet. Add one in Settings › Sounds; it then appears here."}
        </p>
      ) : null}

      {audio.mode !== "silent" ? (
        <span className="nx-studio-inline">
          <input
            className="nx-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audio.volume}
            aria-label="Volume for this sound"
            onChange={(event) => update({ volume: Number(event.target.value) })}
          />
          <output className="nx-studio-output">{Math.round(audio.volume * 100)}%</output>
        </span>
      ) : null}

      {audio.mode !== "silent" ? (
        <p className="nx-studio-hint">
          Played at {Math.round(readNumber(audio.volume, 0.6) * globalVolume * 100)}% once your overall volume is
          applied.
        </p>
      ) : null}
    </StudioField>
  );
}
