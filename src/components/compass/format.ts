const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-07-15' → '15 Jul' (or '15 Jul 2027' when not the current year). */
export function formatCompassDate(ymd: string, now: Date = new Date()): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const base = `${day} ${MONTHS[month - 1] ?? '?'}`;
  return year === now.getFullYear() ? base : `${base} ${year}`;
}

/**
 * `daysRemaining` is signed, so overdue reads as overdue instead of stalling at
 * "0 days left" forever once a target has passed.
 */
export function daysLeftText(daysRemaining: number | null | undefined): string {
  if (daysRemaining == null) return '';
  if (daysRemaining === 0) return 'due today';
  const days = Math.abs(daysRemaining);
  const unit = days === 1 ? 'day' : 'days';
  return daysRemaining > 0 ? `${days} ${unit} left` : `${days} ${unit} over`;
}

export const SCORE_GREEN = '#4caf50';
export const SCORE_RED = '#e53935';

/**
 * How a number is doing, as a tone rather than a colour.
 *
 * Red and green are strong words and they were being spent on ordinary
 * numbers: a goal three weeks in at 14% of its money read as an emergency,
 * when it is just early. So the palette's own colours carry the everyday case,
 * and the two loud ones are reserved for the two things worth interrupting
 * someone about — you are materially behind the clock, or you are far enough
 * ahead that this is going to finish well.
 */
export type PaceTone = 'neutral' | 'strong' | 'behind';

/** Below the pace the calendar implies by this much, and it is a real gap. */
const BEHIND_SLACK = 0.15;
/** At or past this, and not behind, the thing is on course to land. */
const STRONG = 0.8;
/** With no clock to judge against, this is where a ratio stops being ordinary. */
const WEAK = 0.5;

/**
 * `progress` and `elapsed` are both 0..1. Pass `elapsed` as null for a figure
 * that is already measured against what was due to date — a consistency ratio
 * carries its own pace, so comparing it to the calendar again double-counts.
 */
export function paceTone(
  progress: number | null | undefined,
  elapsed: number | null,
): PaceTone {
  if (progress == null) return 'neutral';

  if (elapsed == null) {
    if (progress >= STRONG) return 'strong';
    return progress < WEAK ? 'behind' : 'neutral';
  }

  if (progress < elapsed - BEHIND_SLACK) return 'behind';
  if (progress >= STRONG && progress >= elapsed) return 'strong';
  return 'neutral';
}

/**
 * The colour for a tone. `neutral` takes the caller's own theme colour, so two
 * things being read side by side can stay distinguishable while both are
 * ordinary.
 */
export function toneColor(tone: PaceTone, neutral: string): string {
  if (tone === 'strong') return SCORE_GREEN;
  if (tone === 'behind') return SCORE_RED;
  return neutral;
}

/** A 0..1 ratio as the 0-100 figure the UI prints. Null stays null. */
export function ratioScore(ratio: number | null | undefined): number | null {
  return ratio == null ? null : Math.round(ratio * 100);
}

/** Thousands separators, and `4k` where the exact figure is not the point. */
export function compact(value: number): string {
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  return Math.round(value).toLocaleString();
}
