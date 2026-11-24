/**
 * An episode's audio fingerprint: one 32-bit word for every 50ms of sound.
 *
 * The Haitsma–Kalker method ("A Highly Robust Audio Fingerprinting System",
 * 2002): the sound is cut into overlapping windows, each window's spectrum
 * into 33 bands spaced evenly in pitch between 300 and 2000 Hz, and each bit
 * says whether the difference between two neighbouring bands grew or shrank
 * since the window before. What it records is the shape of the sound, not its
 * bytes, so the same speech fingerprints alike however it was cut, joined or
 * encoded again: which is what an ad server does to an episode.
 *
 * Used to find the stretches of one copy of an episode in another
 * (`align.ts`). Pure: it takes decoded samples, so it can be tested without
 * ffmpeg.
 */

/** The rate samples are decoded at. Speech carries nothing a fingerprint needs above 4 kHz. */
export const FINGERPRINT_SAMPLE_RATE = 8_000;
/** 256ms windows, a new one every 50ms: 20 words a second. */
const WINDOW = 2_048;
const HOP = 400;
export const FRAMES_PER_SECOND = FINGERPRINT_SAMPLE_RATE / HOP;

const BANDS = 33;
const LOW_HZ = 300;
const HIGH_HZ = 2_000;

/** Which FFT bins fall in each band, decided once. */
const BAND_EDGES: number[] = (() => {
  const edges: number[] = [];
  const binHz = FINGERPRINT_SAMPLE_RATE / WINDOW;
  for (let b = 0; b <= BANDS; b++) {
    const hz = LOW_HZ * Math.pow(HIGH_HZ / LOW_HZ, b / BANDS);
    edges.push(Math.round(hz / binHz));
  }
  return edges;
})();

const HANN: Float64Array = (() => {
  const w = new Float64Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1));
  return w;
})();

/** Where each index of a window lands after the FFT's bit reversal, worked out once. */
const BIT_REVERSED: Uint16Array = (() => {
  const table = new Uint16Array(WINDOW);
  for (let i = 1, j = 0; i < WINDOW; i++) {
    let bit = WINDOW >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    table[i] = j;
  }
  return table;
})();

/** The FFT's twiddle factors for a window, worked out once: cos and sin of -2πk/N. */
const TWIDDLE_RE = new Float64Array(WINDOW / 2);
const TWIDDLE_IM = new Float64Array(WINDOW / 2);
for (let k = 0; k < WINDOW / 2; k++) {
  TWIDDLE_RE[k] = Math.cos((-2 * Math.PI * k) / WINDOW);
  TWIDDLE_IM[k] = Math.sin((-2 * Math.PI * k) / WINDOW);
}

/** In-place radix-2 FFT over one window's `re`/`im`. */
function fft(re: Float64Array, im: Float64Array): void {
  for (let i = 1; i < WINDOW; i++) {
    const j = BIT_REVERSED[i]!;
    if (i < j) {
      const r = re[i]!;
      re[i] = re[j]!;
      re[j] = r;
      const m = im[i]!;
      im[i] = im[j]!;
      im[j] = m;
    }
  }
  for (let len = 2; len <= WINDOW; len <<= 1) {
    const half = len >> 1;
    const stride = WINDOW / len;
    for (let i = 0; i < WINDOW; i += len) {
      for (let k = 0; k < half; k++) {
        const wRe = TWIDDLE_RE[k * stride]!;
        const wIm = TWIDDLE_IM[k * stride]!;
        const a = i + k;
        const b = a + half;
        const bRe = re[b]! * wRe - im[b]! * wIm;
        const bIm = re[b]! * wIm + im[b]! * wRe;
        re[b] = re[a]! - bRe;
        im[b] = im[a]! - bIm;
        re[a] = re[a]! + bRe;
        im[a] = im[a]! + bIm;
      }
    }
  }
}

/**
 * A fingerprint made as samples arrive, so a long episode is never held
 * decoded in memory: only one window of it at a time.
 */
export interface Fingerprinter {
  /** More mono samples at `FINGERPRINT_SAMPLE_RATE`, in [-1, 1]. */
  push(samples: Float32Array): void;
  /** The fingerprint of everything pushed. */
  finish(): Uint32Array;
}

export function createFingerprinter(): Fingerprinter {
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);
  let previous = new Float64Array(BANDS);
  let current = new Float64Array(BANDS);
  // Samples not yet consumed by a window, and how many of its slots are filled.
  let pending = new Float32Array(WINDOW * 4);
  let filled = 0;
  let frames = 0;
  let words = new Uint32Array(1 << 14);
  let count = 0;

  const word = () => {
    let w = 0;
    for (let m = 0; m < BANDS - 1; m++) {
      const now = current[m]! - current[m + 1]!;
      const before = previous[m]! - previous[m + 1]!;
      if (now - before > 0) w |= 1 << m;
    }
    return w >>> 0;
  };

  const windowAt = (at: number) => {
    for (let i = 0; i < WINDOW; i++) {
      re[i] = pending[at + i]! * HANN[i]!;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < BANDS; b++) {
      let sum = 0;
      for (let k = BAND_EDGES[b]!; k < BAND_EDGES[b + 1]!; k++) sum += re[k]! * re[k]! + im[k]! * im[k]!;
      current[b] = sum;
    }
    if (frames > 0) {
      if (count === words.length) {
        const grown = new Uint32Array(words.length * 2);
        grown.set(words);
        words = grown;
      }
      words[count++] = word();
    }
    frames += 1;
    [previous, current] = [current, previous];
  };

  return {
    push(samples) {
      if (filled + samples.length > pending.length) {
        const grown = new Float32Array(Math.max(pending.length * 2, filled + samples.length));
        grown.set(pending.subarray(0, filled));
        pending = grown;
      }
      pending.set(samples, filled);
      filled += samples.length;
      let at = 0;
      while (at + WINDOW <= filled) {
        windowAt(at);
        at += HOP;
      }
      // Keep what the next window still needs.
      pending.copyWithin(0, at, filled);
      filled -= at;
    },
    finish() {
      return words.slice(0, count);
    },
  };
}

/** A fingerprint as the transcript carries it, base64, and back: the one encoding the worker and `/align` share. */
export function fingerprintToText(words: Uint32Array): string {
  return Buffer.from(words.buffer, words.byteOffset, words.byteLength).toString('base64');
}

export function fingerprintFromText(text: string): Uint32Array {
  const bytes = Buffer.from(text, 'base64');
  const copy = new Uint8Array(bytes.byteLength - (bytes.byteLength % 4));
  copy.set(bytes.subarray(0, copy.byteLength));
  return new Uint32Array(copy.buffer);
}
