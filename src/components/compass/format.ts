import type { CompassScheduleStatus } from 'samwell-shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-07-15' → '15 Jul' (or '15 Jul 2027' when not the current year). */
export function formatCompassDate(ymd: string, now: Date = new Date()): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const base = `${day} ${MONTHS[month - 1] ?? '?'}`;
  return year === now.getFullYear() ? base : `${base} ${year}`;
}

/** Short pace read for the dashboard strip and the progress sheet: "On track", "2 days behind". */
export function paceVerdict(status: CompassScheduleStatus, varianceDays: number | null): string {
  if (status === 'unknown' || varianceDays === null) return 'Not enough data yet';
  if (status === 'on_track') return 'On track';
  const days = Math.abs(varianceDays);
  const unit = days === 1 ? 'day' : 'days';
  return status === 'behind' ? `${days} ${unit} behind` : `${days} ${unit} ahead`;
}

export const SCORE_GREEN = '#4caf50';
export const SCORE_RED = '#e53935';

/**
 * Focus-score colour psychology: green at 70+, the theme gold between 50 and 69,
 * red below 50. `gold` is passed in so it stays theme-aware (light/dark).
 * A null score (nothing logged yet) falls back to gold.
 */
export function scoreColor(score: number | null | undefined, gold: string): string {
  if (score == null) return gold;
  if (score >= 70) return SCORE_GREEN;
  if (score >= 50) return gold;
  return SCORE_RED;
}
