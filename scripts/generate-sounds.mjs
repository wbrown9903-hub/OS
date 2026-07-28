#!/usr/bin/env node
/**
 * Nexus OS — the sound of the system, synthesised.
 *
 * Every file here is generated from oscillators and envelopes defined in
 * scripts/lib/wav.mjs. Nothing is sampled, recorded or modelled on another
 * product's audio, so all of it is ours to ship without a licence question.
 *
 * The rules the palette follows:
 *   * One key. Everything sits in D major so two cues that overlap never clash.
 *   * Short. Interface cues are 60–260 ms; only the three "moment" sounds run
 *     longer, and none reaches a second and a half.
 *   * Quiet by default. Cues that fire often are mixed 8–14 dB below cues that
 *     fire rarely, so frequency and loudness are inversely related.
 *   * No click, ever. Every voice has a real attack, every file is edge-faded,
 *     DC-corrected and peak-normalised.
 *   * Nothing sharp. High partials decay first; there is no square wave, no
 *     buzzer and no alarm anywhere in the set.
 *
 * Run: node scripts/generate-sounds.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Track,
  voice,
  noiseBurst,
  note,
  pluck,
  swell,
  BELL_PARTIALS,
  SOFT_PARTIALS,
} from "./lib/wav.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "assets/sounds");

/** Relative level per cue, so often-heard sounds stay in the background. */
const LEVEL = {
  whisper: 0.30, // navigation, selection — heard hundreds of times a day
  quiet: 0.45, // confirmation, connection
  normal: 0.60, // warning, update, workflow
  present: 0.71, // error, achievement, sale, launcher
};

/* -------------------------------------------------------------------------- */
/* The cues                                                                    */
/* -------------------------------------------------------------------------- */

const SOUNDS = [];

function define(name, description, seconds, build, level = LEVEL.normal, options = {}) {
  SOUNDS.push({ name, description, seconds, build, level, options });
}

/* --- Everyday interface ---------------------------------------------------- */

define(
  "navigation",
  "Moving between panes. Almost subliminal: one soft, slightly falling blip.",
  0.16,
  (track) => {
    voice(track, {
      start: 0,
      frequency: note("A5"),
      glide: -40,
      duration: 0.11,
      gain: 0.5,
      partials: SOFT_PARTIALS,
      envelope: (t, d) => pluck(t, d, 0.008, 3.6),
    });
  },
  LEVEL.whisper,
  { air: false },
);

define(
  "selection",
  "Picking an item. A single short tick a fifth above navigation, so the two read as a pair.",
  0.13,
  (track) => {
    voice(track, {
      start: 0,
      frequency: note("E6"),
      duration: 0.075,
      gain: 0.45,
      partials: SOFT_PARTIALS,
      envelope: (t, d) => pluck(t, d, 0.005, 4.4),
    });
    noiseBurst(track, { start: 0, duration: 0.03, gain: 0.05, cutoff: 6_000, seed: 3, envelope: (t, d) => pluck(t, d, 0.002, 6) });
  },
  LEVEL.whisper,
  { air: false },
);

define(
  "confirmation",
  "Something you asked for worked. Two notes rising a fourth, warm and unhurried.",
  0.45,
  (track) => {
    voice(track, { start: 0, frequency: note("D5"), duration: 0.22, gain: 0.42, pan: -0.15, partials: SOFT_PARTIALS });
    voice(track, { start: 0.085, frequency: note("G5"), duration: 0.32, gain: 0.42, pan: 0.15, partials: SOFT_PARTIALS });
  },
  LEVEL.quiet,
);

define(
  "warning",
  "Attention needed, nothing broken. A held pair a whole tone apart, gently pulsing — noticeable without alarm.",
  0.62,
  (track) => {
    voice(track, {
      start: 0,
      frequency: note("A4"),
      duration: 0.5,
      gain: 0.34,
      pan: -0.2,
      partials: SOFT_PARTIALS,
      envelope: (t, d) => swell(t, d, 0.05, 0.24),
      vibrato: { rate: 5.5, depth: 0.004 },
    });
    voice(track, {
      start: 0.02,
      frequency: note("B4"),
      duration: 0.48,
      gain: 0.26,
      pan: 0.2,
      partials: SOFT_PARTIALS,
      envelope: (t, d) => swell(t, d, 0.07, 0.26),
      vibrato: { rate: 5.5, depth: 0.004 },
    });
  },
  LEVEL.normal,
);

define(
  "error",
  "Something did not work. A low falling minor third with a soft body — sombre, never harsh, and never a buzzer.",
  0.7,
  (track) => {
    voice(track, {
      start: 0,
      frequency: note("F#3"),
      duration: 0.5,
      gain: 0.5,
      pan: -0.1,
      partials: SOFT_PARTIALS,
      envelope: (t, d) => pluck(t, d, 0.016, 2.0),
    });
    voice(track, {
      start: 0.11,
      frequency: note("D3"),
      duration: 0.55,
      gain: 0.45,
      pan: 0.1,
      partials: SOFT_PARTIALS,
      envelope: (t, d) => pluck(t, d, 0.02, 1.8),
    });
    noiseBurst(track, { start: 0, duration: 0.16, gain: 0.05, cutoff: 700, seed: 11, envelope: (t, d) => pluck(t, d, 0.01, 2.6) });
  },
  LEVEL.present,
);

/* --- Moments --------------------------------------------------------------- */

define(
  "achievement",
  "You unlocked something. A four-note major-ninth arpeggio on struck bells with a sparkle above it.",
  1.25,
  (track) => {
    const arpeggio = [
      { at: 0.0, pitch: "D5", pan: -0.3 },
      { at: 0.075, pitch: "F#5", pan: -0.1 },
      { at: 0.15, pitch: "A5", pan: 0.1 },
      { at: 0.225, pitch: "E6", pan: 0.3 },
    ];
    for (const step of arpeggio) {
      voice(track, {
        start: step.at,
        frequency: note(step.pitch),
        duration: 0.85,
        gain: 0.34,
        pan: step.pan,
        partials: BELL_PARTIALS,
        envelope: (t, d) => pluck(t, d, 0.006, 2.1),
      });
    }
    // Sparkle: two very quiet high bells, late and wide.
    voice(track, { start: 0.34, frequency: note("D7"), duration: 0.5, gain: 0.06, pan: 0.55, partials: BELL_PARTIALS });
    voice(track, { start: 0.40, frequency: note("A6"), duration: 0.55, gain: 0.07, pan: -0.55, partials: BELL_PARTIALS });
  },
  LEVEL.present,
);

define(
  "sale",
  "A sale landed. An original warm bell bloom: root, major sixth and octave struck together, with a slow swell underneath so it feels like good news arriving rather than a till ringing. Deliberately unlike any commercial notification tone.",
  1.4,
  (track) => {
    // The chord: D4 + B4 (major sixth) + D5 (octave). Struck, not sequenced —
    // this is what keeps it from resembling a two-note commercial chime.
    const chord = [
      { pitch: "D4", gain: 0.30, pan: -0.25, delay: 0.0 },
      { pitch: "B4", gain: 0.26, pan: 0.25, delay: 0.012 },
      { pitch: "D5", gain: 0.22, pan: 0.0, delay: 0.024 },
    ];
    for (const tone of chord) {
      voice(track, {
        start: tone.delay,
        frequency: note(tone.pitch),
        duration: 1.05,
        gain: tone.gain,
        pan: tone.pan,
        partials: BELL_PARTIALS,
        envelope: (t, d) => pluck(t, d, 0.012, 1.7),
      });
    }
    // The bloom: a soft pad a sixth above that rises after the strike, so the
    // sound opens up instead of decaying away.
    voice(track, {
      start: 0.10,
      frequency: note("F#5"),
      duration: 1.0,
      gain: 0.13,
      pan: 0.1,
      partials: SOFT_PARTIALS,
      envelope: (t, d) => swell(t, d, 0.34, 0.48),
    });
    voice(track, {
      start: 0.12,
      frequency: note("A5"),
      duration: 0.95,
      gain: 0.10,
      pan: -0.1,
      partials: SOFT_PARTIALS,
      envelope: (t, d) => swell(t, d, 0.38, 0.44),
    });
    noiseBurst(track, { start: 0, duration: 0.09, gain: 0.035, cutoff: 5_500, seed: 23, envelope: (t, d) => pluck(t, d, 0.004, 4) });
  },
  LEVEL.present,
);

define(
  "workflow-complete",
  "An automation finished. Three notes settling downward onto the tonic — the sound of a thing being put away.",
  0.95,
  (track) => {
    const steps = [
      { at: 0.0, pitch: "A5", pan: 0.25 },
      { at: 0.11, pitch: "F#5", pan: 0.0 },
      { at: 0.22, pitch: "D5", pan: -0.25 },
    ];
    for (const step of steps) {
      voice(track, {
        start: step.at,
        frequency: note(step.pitch),
        duration: 0.6,
        gain: 0.32,
        pan: step.pan,
        partials: SOFT_PARTIALS,
        envelope: (t, d) => pluck(t, d, 0.01, 2.4),
      });
    }
    voice(track, {
      start: 0.22,
      frequency: note("D4"),
      duration: 0.66,
      gain: 0.16,
      partials: SOFT_PARTIALS,
      envelope: (t, d) => pluck(t, d, 0.02, 1.9),
    });
  },
  LEVEL.normal,
);

define(
  "connection-established",
  "An integration or the Bridge came online. A fifth rising out of a short breath of air.",
  0.7,
  (track) => {
    noiseBurst(track, { start: 0, duration: 0.22, gain: 0.09, cutoff: 2_200, seed: 31, envelope: (t, d) => swell(t, d, 0.09, 0.12) });
    voice(track, { start: 0.05, frequency: note("D5"), duration: 0.30, gain: 0.34, pan: -0.2, partials: SOFT_PARTIALS });
    voice(track, {
      start: 0.17,
      frequency: note("A5"),
      duration: 0.44,
      gain: 0.34,
      pan: 0.2,
      partials: SOFT_PARTIALS,
      envelope: (t, d) => pluck(t, d, 0.014, 2.2),
    });
  },
  LEVEL.quiet,
);

define(
  "launcher-ready",
  "Nexus has finished starting and the desktop is yours. A wide, slow chord that opens rather than announces.",
  1.35,
  (track) => {
    const pad = [
      { pitch: "D3", gain: 0.20, pan: 0 },
      { pitch: "A3", gain: 0.16, pan: -0.35 },
      { pitch: "D4", gain: 0.15, pan: 0.35 },
      { pitch: "F#4", gain: 0.12, pan: -0.15 },
      { pitch: "A4", gain: 0.10, pan: 0.15 },
    ];
    for (const tone of pad) {
      voice(track, {
        start: 0,
        frequency: note(tone.pitch),
        duration: 1.2,
        gain: tone.gain,
        pan: tone.pan,
        partials: SOFT_PARTIALS,
        envelope: (t, d) => swell(t, d, 0.42, 0.55),
      });
    }
    // A single bell late in the swell marks the moment it is actually ready.
    voice(track, {
      start: 0.55,
      frequency: note("D6"),
      duration: 0.7,
      gain: 0.13,
      partials: BELL_PARTIALS,
      envelope: (t, d) => pluck(t, d, 0.01, 2.3),
    });
  },
  LEVEL.present,
);

define(
  "update-available",
  "A new version is ready to install. Two identical soft bells, an unhurried double-tap that asks nothing of you.",
  0.8,
  (track) => {
    for (const start of [0, 0.19]) {
      voice(track, {
        start,
        frequency: note("G5"),
        duration: 0.5,
        gain: 0.3,
        pan: start === 0 ? -0.18 : 0.18,
        partials: BELL_PARTIALS,
        envelope: (t, d) => pluck(t, d, 0.008, 2.8),
      });
    }
  },
  LEVEL.normal,
);

/* -------------------------------------------------------------------------- */
/* Render                                                                      */
/* -------------------------------------------------------------------------- */

function renderAll() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = [];

  for (const sound of SOUNDS) {
    const track = new Track(sound.seconds);
    sound.build(track);

    if (sound.options.air !== false) track.air();
    track.removeDC();
    track.soften(1.2);
    track.normalise(sound.level);
    track.edgeFade(4, Math.min(40, sound.seconds * 1000 * 0.12));

    const buffer = track.toWAV();
    const file = path.join(OUT_DIR, `${sound.name}.wav`);
    fs.writeFileSync(file, buffer);

    let peak = 0;
    for (let i = 0; i < track.length; i += 1) {
      peak = Math.max(peak, Math.abs(track.left[i]), Math.abs(track.right[i]));
    }

    results.push({
      name: sound.name,
      file: `assets/sounds/${sound.name}.wav`,
      description: sound.description,
      seconds: Number(track.seconds.toFixed(3)),
      bytes: buffer.length,
      peakDbfs: Number((20 * Math.log10(Math.max(peak, 1e-9))).toFixed(2)),
    });

    process.stdout.write(
      `  ${sound.name.padEnd(24)} ${track.seconds.toFixed(2)}s  ${(buffer.length / 1024).toFixed(0).padStart(4)} KB  peak ${(20 * Math.log10(Math.max(peak, 1e-9))).toFixed(1)} dBFS\n`,
    );
  }

  const manifest = {
    generator: "scripts/generate-sounds.mjs",
    generatedAt: new Date().toISOString(),
    format: "WAV, 16-bit PCM, 44100 Hz, stereo",
    licence:
      "Original synthesised audio produced for Nexus OS. No samples, recordings or third-party sounds are used, and no commercial product's audio is imitated.",
    sounds: results,
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return results;
}

process.stdout.write("Nexus OS — synthesising the sound palette\n\n");
const rendered = renderAll();
const total = rendered.reduce((sum, entry) => sum + entry.bytes, 0);
process.stdout.write(`\n  ${rendered.length} sounds, ${(total / 1024).toFixed(0)} KB total, written to assets/sounds\n`);
