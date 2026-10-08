/**
 * Whether this phone runs the Enhanced voices without long pauses.
 *
 * Measured, not estimated. On a Galaxy A33 (sold as 6 GB, reports 5.3 GB)
 * Kokoro paused badly and Supertonic was usable but paused long enough to
 * look frozen. So the bar is the next class up: a phone sold as 8 GB, which
 * reports between about 7.2 and 7.8. The line sits at 7 so every 8 GB phone
 * clears it and no 6 GB phone does.
 *
 * Under the bar is a warning and not a wall: the voices still load, and
 * somebody may prefer a better voice with pauses. The wall is much lower, and
 * is `AI_VOICES_SUPPORTED` in the catalogue.
 */
export type EnhancedFit = 'smooth' | 'strained';

const GB = 1024 ** 3;
export const ENHANCED_SMOOTH_BYTES = 7 * GB;
/** What the bar is called, in the size phones are sold by. */
export const ENHANCED_SMOOTH_LABEL = '8 GB';

export function enhancedFit(totalBytes: number | null | undefined): EnhancedFit {
  // Nothing to judge with: say yes rather than warn over a missing number.
  if (!totalBytes) return 'smooth';
  return totalBytes >= ENHANCED_SMOOTH_BYTES ? 'smooth' : 'strained';
}

export type EnhancedFitCopy = {
  /** The tappable line under the switch. */
  mark: string;
  /** The sheet's title and its one line. */
  title: string;
  line: string;
  /** What to do about it, when there is something to do. */
  advice: string | null;
};

const SMOOTH: EnhancedFitCopy = {
  mark: 'Runs smoothly on this phone',
  title: 'Your phone runs these smoothly',
  line: 'Enhanced voices will read on this phone without long pauses.',
  advice: null,
};

const STRAINED: EnhancedFitCopy = {
  mark: 'Needs a more powerful phone',
  title: 'These may pause on this phone',
  line: `Enhanced voices are made for phones with ${ENHANCED_SMOOTH_LABEL} of memory or more. On this one, reading may stop and start. You can still try them.`,
  // Cloud Kokoro is for exactly this phone: the same voices, made in the
  // cloud, so a phone that strains to make them itself does not have to.
  advice:
    'If the pauses get in the way, use Lite voices, or Cloud: the same Kokoro voices, read from the cloud so the phone does not strain.',
};

export function enhancedFitCopy(fit: EnhancedFit): EnhancedFitCopy {
  return fit === 'smooth' ? SMOOTH : STRAINED;
}
