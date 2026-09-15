/**
 * What counts as having read on a given day.
 *
 * The timeline calendar used to dot a day based on how many highlights were
 * saved that day. That rewarded annotating a single paragraph over reading
 * fifty pages in silence, which is exactly backwards: the question the
 * calendar answers is "did you actually read", not "did you take notes".
 * Progress through the book is the honest signal, so all of it lives here.
 *
 * Units throughout are a fraction of one book's length (0..1), because that's
 * what the reader reports; page counts aren't available for every EPUB.
 */

/**
 * Largest single progress jump still counted as reading.
 *
 * Progress writes are debounced to 2 seconds, so genuine reading arrives in
 * slivers — 2% of a book in one write would be an implausibly fast reader.
 * Anything larger is navigation: a table-of-contents tap, a bookmark, a
 * restored position. Those move the position without a page being read.
 */
export const MAX_READING_STEP = 0.02;

/**
 * What counts as having read at all: 0.5% of a book. Small enough that a
 * genuine sitting always lands, large enough that opening a book and turning
 * one page by accident doesn't earn the day.
 */
export const READ_DAY_MIN = 0.005;

/** A solid day's reading — 5% of a book — where the dot reaches full strength. */
export const READ_DAY_FULL = 0.05;

/**
 * How much of a progress change counts toward the day.
 *
 * Backwards movement (re-reading, scrubbing back) contributes nothing rather
 * than subtracting — re-reading a page is still reading, it just doesn't earn
 * extra credit, and it must never claw back progress already earned today.
 */
export function countableProgress(previousPct: number, nextPct: number): number {
  const delta = nextPct - previousPct;
  if (!Number.isFinite(delta) || delta <= 0 || delta > MAX_READING_STEP) return 0;
  return delta;
}

/** Whether a day's summed progress counts as a day the user read. */
export function didReadOn(dayTotal: number): boolean {
  return dayTotal >= READ_DAY_MIN;
}

/**
 * Dot opacity for a day, 0.2..1. Never fainter than 0.2 so a real day always
 * registers at a glance; a day with no reading is rendered in its own colour
 * at full strength, so it returns 1 there rather than fading toward invisible.
 */
export function readingDotStrength(dayTotal: number): number {
  if (!didReadOn(dayTotal)) return 1;
  return Math.max(0.2, Math.min(dayTotal / READ_DAY_FULL, 1));
}
