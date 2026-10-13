/**
 * Whether this phone runs an Enhanced voice box without long waits.
 *
 * Measured, not estimated, and per voice box, because they are far apart. On
 * a Galaxy A33 (sold as 6 GB, reports 5.3 GB) Kokoro took three and a half
 * times as long to make speech as to speak it, Supertonic was usable but
 * paused long enough to look frozen, and Paradee made it in half the time.
 *
 * So Kokoro's and Supertonic's bar is the next class up: a phone sold as
 * 8 GB, which reports between about 7.2 and 7.8. The line sits at 7 so every
 * 8 GB phone clears it and no 6 GB phone does. Paradee's bar is the A33's own
 * class, the smallest it has been seen to keep up on: the line sits at 5.
 *
 * Under the bar is a warning and not a wall: the voices still load, and
 * somebody may prefer a better voice with pauses. The wall is much lower, and
 * is `AI_VOICES_SUPPORTED` in the catalogue.
 */
import type { TtsEngineId } from '@/services/device-tts/catalogue';

export type EnhancedFit = 'smooth' | 'strained';

const GB = 1024 ** 3;

/** Each voice box's bar: the memory a phone reports, and the size such a phone is sold as. */
const BARS: Record<TtsEngineId, { bytes: number; label: string }> = {
  paradee: { bytes: 5 * GB, label: '6 GB' },
  supertonic: { bytes: 7 * GB, label: '8 GB' },
  kokoro: { bytes: 7 * GB, label: '8 GB' },
};

/** The voice boxes as they are named in a sentence. */
const NAMES: Record<TtsEngineId, string> = { paradee: 'Paradee', supertonic: 'Supertonic', kokoro: 'Kokoro' };

/** The memory a phone must report to run this voice box smoothly. */
export function enhancedSmoothBytes(engine: TtsEngineId): number {
  return BARS[engine].bytes;
}

export function enhancedFit(totalBytes: number | null | undefined, engine: TtsEngineId): EnhancedFit {
  // Nothing to judge with: say yes rather than warn over a missing number.
  if (!totalBytes) return 'smooth';
  return totalBytes >= BARS[engine].bytes ? 'smooth' : 'strained';
}

/**
 * The first of the offered voice boxes this phone runs smoothly, other than
 * the one asked about: what to point at when that one strains. Null when
 * there is none, or nothing to judge with.
 */
export function smootherBox(
  totalBytes: number | null | undefined,
  engine: TtsEngineId,
  offered: readonly TtsEngineId[],
): TtsEngineId | null {
  if (!totalBytes) return null;
  return offered.find((other) => other !== engine && enhancedFit(totalBytes, other) === 'smooth') ?? null;
}

export type EnhancedFitCopy = {
  /** The tappable line under the voice box. */
  mark: string;
  /** The sheet's title and its one line. */
  title: string;
  line: string;
  /** What to do about it, when there is something to do. */
  advice: string | null;
};

// The first way out is Cloud, because it is the best the app has and the one
// kind of voice this phone's speed has no say in. It is offered for what it
// is, never against what it costs.
const TRY_CLOUD = 'For the best voices, try Cloud.';

/**
 * What to say about a voice box on this phone. `smoother` is a voice box the
 * phone does run smoothly (`smootherBox`): named with the Lite voices as the
 * way to stay on the phone, after Cloud.
 */
export function enhancedFitCopy(fit: EnhancedFit, engine: TtsEngineId, smoother: TtsEngineId | null = null): EnhancedFitCopy {
  const name = NAMES[engine];
  if (fit === 'smooth') {
    return {
      mark: 'Runs smoothly on your phone',
      title: `Your phone runs ${name} smoothly`,
      line: `${name} will read on your phone without long waits.`,
      advice: null,
    };
  }
  return {
    // The mark and the title say the same thing, so opening the sheet reads
    // as the mark with its subject put back.
    mark: 'May be slow on your phone',
    title: `${name} may be slow on your phone`,
    // What straining is like, in the reader's terms: the voice does not
    // stutter, it goes quiet while the next sentence is made. "Runs best
    // with", never "is made for": Paradee is made for small phones, and one
    // smaller than its bar is still told what to expect.
    line: `Expect long silences between sentences. It runs best with ${BARS[engine].label} of memory.`,
    advice: smoother
      ? `${TRY_CLOUD} To stay on the phone, use ${NAMES[smoother]} or Lite voices.`
      : `${TRY_CLOUD} To stay on the phone, use Lite voices.`,
  };
}
