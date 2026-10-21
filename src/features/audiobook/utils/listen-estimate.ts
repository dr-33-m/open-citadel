/**
 * What the rest of a book costs to hear: how long, and about how many
 * Neurons, for the Listen sheet's two figures.
 *
 * Time is the characters left at the voice's learned pace, at the listener's
 * speed. Neurons are the voice's own figure for a chapter's worth of
 * characters (`chapterCredits`, which the server prices), scaled to what is
 * left: an estimate to draw, never the charge, which is made sentence by
 * sentence as it plays.
 *
 * Pure, so it can be tested on its own.
 */
import { CHAPTER_CHARACTERS } from 'samwell-shared';

export interface ListenEstimate {
  seconds: number;
  /** Null for a voice with no price. */
  neurons: number | null;
}

export function listenEstimate({
  charsLeft,
  pace,
  rate,
  chapterCredits,
}: {
  charsLeft: number;
  /** Characters a second at 1×. */
  pace: number;
  rate: number;
  chapterCredits: number | null;
}): ListenEstimate {
  const chars = Math.max(0, charsLeft);
  const seconds = pace > 0 ? chars / pace / (rate > 0 ? rate : 1) : 0;
  if (chapterCredits == null || !(chapterCredits >= 0)) return { seconds, neurons: null };
  if (chars === 0) return { seconds: 0, neurons: 0 };
  return { seconds, neurons: Math.max(1, Math.round((chapterCredits * chars) / CHAPTER_CHARACTERS)) };
}

/** "6 h 10 m", "45 m", "1 m": a figure for a tile, rounded to the minute and never below one. */
export function formatListenTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(Math.max(0, seconds) / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** "About 6 h 12 m left", for the line under a book in the player. */
export function timeLeftLabel(seconds: number): string {
  return seconds > 0 ? `About ${formatListenTime(seconds)} left` : '';
}

/** A figure for the Listen sheet: the number, and what it counts. The shape `StatGrid` draws. */
export interface ListenStat {
  key: string;
  value: string;
  label: string;
}

/** The Listen sheet's figures: the time left, and the Neurons it costs when the voice has a price. Nothing that is zero. */
export function listenStats(estimate: ListenEstimate): ListenStat[] {
  const stats: ListenStat[] = [{ key: 'time', value: formatListenTime(estimate.seconds), label: 'ABOUT LEFT' }];
  if (estimate.neurons) stats.push({ key: 'neurons', value: estimate.neurons.toLocaleString('en-US'), label: 'ABOUT NEURONS' });
  return stats;
}
