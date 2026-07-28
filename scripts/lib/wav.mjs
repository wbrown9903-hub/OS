/**
 * A dependency-free WAV writer and a very small synthesis toolkit.
 *
 * Everything Nexus plays is synthesised here from oscillators, envelopes and
 * filters written in this file. No sample library, no recorded audio and no
 * imitation of anyone else's sound is involved, so the result is ours to ship.
 *
 * Format: 16-bit signed PCM, little-endian, 44.1 kHz — the most universally
 * playable thing that still sounds good, and what AVAudioPlayer and every
 * browser accept without transcoding.
 */

export const SAMPLE_RATE = 44_100;

/* -------------------------------------------------------------------------- */
/* Container                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @param {Float32Array[]} channels one array per channel, values in -1..1
 * @param {number} sampleRate
 */
export function encodeWAV(channels, sampleRate = SAMPLE_RATE) {
  const channelCount = channels.length;
  const frameCount = channels[0].length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format 1 = PCM
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = Math.max(-1, Math.min(1, channels[channel][frame]));
      // Symmetric scaling: -32768 is avoided so the waveform stays centred.
      buffer.writeInt16LE(Math.round(value * 32767), offset);
      offset += 2;
    }
  }
  return buffer;
}

/* -------------------------------------------------------------------------- */
/* A tiny stereo bus                                                           */
/* -------------------------------------------------------------------------- */

export class Track {
  constructor(seconds, sampleRate = SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.length = Math.ceil(seconds * sampleRate);
    this.left = new Float32Array(this.length);
    this.right = new Float32Array(this.length);
  }

  add(index, value, pan = 0) {
    if (index < 0 || index >= this.length) return;
    // Equal-power panning keeps perceived loudness constant across the image.
    const angle = ((pan + 1) / 2) * (Math.PI / 2);
    this.left[index] += value * Math.cos(angle);
    this.right[index] += value * Math.sin(angle);
  }

  /** Peak-normalise both channels together, preserving the stereo image. */
  normalise(peak = 0.7079) {
    let maximum = 0;
    for (let i = 0; i < this.length; i += 1) {
      maximum = Math.max(maximum, Math.abs(this.left[i]), Math.abs(this.right[i]));
    }
    if (maximum === 0) return this;
    const gain = peak / maximum;
    for (let i = 0; i < this.length; i += 1) {
      this.left[i] *= gain;
      this.right[i] *= gain;
    }
    return this;
  }

  /** Remove any DC offset, which would otherwise click on playback start. */
  removeDC() {
    for (const channel of [this.left, this.right]) {
      let sum = 0;
      for (let i = 0; i < channel.length; i += 1) sum += channel[i];
      const mean = sum / channel.length;
      for (let i = 0; i < channel.length; i += 1) channel[i] -= mean;
    }
    return this;
  }

  /**
   * Guarantee a click-free start and end. Even a perfectly enveloped note can
   * click if it is truncated by the buffer, so this is applied to everything.
   */
  edgeFade(fadeInMs = 4, fadeOutMs = 24) {
    const fadeIn = Math.max(1, Math.round((fadeInMs / 1000) * this.sampleRate));
    const fadeOut = Math.max(1, Math.round((fadeOutMs / 1000) * this.sampleRate));
    for (let i = 0; i < fadeIn && i < this.length; i += 1) {
      const g = i / fadeIn;
      const smooth = g * g * (3 - 2 * g);
      this.left[i] *= smooth;
      this.right[i] *= smooth;
    }
    for (let i = 0; i < fadeOut && i < this.length; i += 1) {
      const index = this.length - 1 - i;
      const g = i / fadeOut;
      const smooth = g * g * (3 - 2 * g);
      this.left[index] *= smooth;
      this.right[index] *= smooth;
    }
    return this;
  }

  /** Soft saturation — tames any peak without the hard edge of clipping. */
  soften(amount = 1.0) {
    for (const channel of [this.left, this.right]) {
      for (let i = 0; i < channel.length; i += 1) {
        channel[i] = Math.tanh(channel[i] * amount) / Math.tanh(amount);
      }
    }
    return this;
  }

  /**
   * Cheap early-reflection "air": a handful of quiet, spread taps. Enough to
   * stop a sound feeling glued to the speaker, far short of a reverb.
   */
  air(amountLeft = 0.16, amountRight = 0.13) {
    const taps = [
      { ms: 17, gain: 1.0, pan: -1 },
      { ms: 29, gain: 0.72, pan: 1 },
      { ms: 43, gain: 0.5, pan: -1 },
      { ms: 61, gain: 0.34, pan: 1 },
    ];
    const sourceL = Float32Array.from(this.left);
    const sourceR = Float32Array.from(this.right);
    for (const tap of taps) {
      const delay = Math.round((tap.ms / 1000) * this.sampleRate);
      for (let i = delay; i < this.length; i += 1) {
        if (tap.pan < 0) {
          this.left[i] += sourceR[i - delay] * amountLeft * tap.gain;
        } else {
          this.right[i] += sourceL[i - delay] * amountRight * tap.gain;
        }
      }
    }
    return this;
  }

  toWAV() {
    return encodeWAV([this.left, this.right], this.sampleRate);
  }

  get seconds() {
    return this.length / this.sampleRate;
  }
}

/* -------------------------------------------------------------------------- */
/* Envelopes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Percussive envelope with a genuine (short but non-zero) attack, so nothing
 * ever starts on a discontinuity. `curve` above 1 decays faster at the start.
 */
export function pluck(t, duration, attack = 0.006, curve = 3.2) {
  if (t < 0 || t > duration) return 0;
  if (t < attack) {
    const g = t / attack;
    return g * g * (3 - 2 * g);
  }
  const decayed = (t - attack) / (duration - attack);
  return Math.pow(1 - decayed, curve) * Math.exp(-decayed * 1.4);
}

/** Gentle swell: slow in, plateau, slow out. Used for pads and "ready" cues. */
export function swell(t, duration, attack = 0.12, release = 0.35) {
  if (t < 0 || t > duration) return 0;
  const rise = Math.min(1, t / attack);
  const fallStart = duration - release;
  const fall = t <= fallStart ? 1 : Math.max(0, 1 - (t - fallStart) / release);
  const smooth = (v) => v * v * (3 - 2 * v);
  return smooth(rise) * smooth(fall);
}

/* -------------------------------------------------------------------------- */
/* Oscillators and filters                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A struck-bell voice: a fundamental plus inharmonic partials whose upper
 * components die away faster, which is what makes a bell sound like a bell.
 */
export const BELL_PARTIALS = [
  { ratio: 1.0, gain: 1.0, decay: 1.0 },
  { ratio: 2.01, gain: 0.42, decay: 0.62 },
  { ratio: 2.99, gain: 0.22, decay: 0.45 },
  { ratio: 4.18, gain: 0.11, decay: 0.32 },
  { ratio: 5.43, gain: 0.06, decay: 0.24 },
];

export const SOFT_PARTIALS = [
  { ratio: 1.0, gain: 1.0, decay: 1.0 },
  { ratio: 2.0, gain: 0.18, decay: 0.55 },
  { ratio: 3.0, gain: 0.07, decay: 0.35 },
];

/**
 * Play one voice into a track.
 *
 * @param {Track} track
 * @param {object} note
 *   start      seconds
 *   frequency  Hz
 *   duration   seconds
 *   gain       linear
 *   pan        -1..1
 *   partials   partial table
 *   envelope   (t, duration) => 0..1
 *   glide      optional Hz offset applied linearly across the note
 *   vibrato    { rate, depth } optional
 */
export function voice(track, note) {
  const {
    start,
    frequency,
    duration,
    gain = 0.3,
    pan = 0,
    partials = SOFT_PARTIALS,
    envelope = pluck,
    glide = 0,
    vibrato = null,
  } = note;

  const startSample = Math.round(start * track.sampleRate);
  const totalSamples = Math.ceil(duration * track.sampleRate);
  const phases = partials.map(() => 0);

  for (let n = 0; n < totalSamples; n += 1) {
    const index = startSample + n;
    if (index >= track.length) break;
    const t = n / track.sampleRate;
    const progress = t / duration;

    let f = frequency + glide * progress;
    if (vibrato) f *= 1 + Math.sin(TAU * vibrato.rate * t) * vibrato.depth;

    const amplitude = envelope(t, duration);
    let sample = 0;
    for (let p = 0; p < partials.length; p += 1) {
      const partial = partials[p];
      phases[p] += (TAU * f * partial.ratio) / track.sampleRate;
      // Upper partials fade sooner: raise the envelope to a power > 1.
      const partialEnvelope = Math.pow(amplitude, 1 / Math.max(0.05, partial.decay));
      sample += Math.sin(phases[p]) * partial.gain * partialEnvelope;
    }
    track.add(index, sample * gain, pan);
  }
}

const TAU = Math.PI * 2;

/** Filtered noise, for breath and texture rather than as a sound in itself. */
export function noiseBurst(track, { start, duration, gain = 0.1, cutoff = 3_000, pan = 0, envelope = pluck, seed = 1 }) {
  const startSample = Math.round(start * track.sampleRate);
  const totalSamples = Math.ceil(duration * track.sampleRate);
  // Deterministic PRNG so regenerating never changes the shipped file.
  let state = (seed * 2654435761) >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967295 - 0.5;
  };
  const alpha = 1 - Math.exp((-TAU * cutoff) / track.sampleRate);
  let low = 0;
  for (let n = 0; n < totalSamples; n += 1) {
    const index = startSample + n;
    if (index >= track.length) break;
    const t = n / track.sampleRate;
    low += alpha * (random() - low);
    track.add(index, low * gain * envelope(t, duration), pan);
  }
}

/* -------------------------------------------------------------------------- */
/* Musical helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Equal temperament, A4 = 440 Hz. `note("C5")`, `note("F#4")`. */
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function note(name) {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!match) throw new Error(`Unrecognised note: ${name}`);
  const [, letter, accidental, octave] = match;
  let semitone = SEMITONES[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  const midi = semitone + (Number(octave) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
