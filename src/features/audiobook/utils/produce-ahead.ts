/**
 * How far ahead of the voice the audiobook makes its sentences.
 *
 * By time, not count: at least two minutes of made audio past the sentence
 * playing, at most three, measured as the listener hears it (at their
 * speed). Under two it starts making again and carries on until three, so a
 * stop wastes at most three minutes of paid audio and a fast listener never
 * runs dry.
 *
 * Pure, so it can be tested on its own.
 */

export const AHEAD_MIN_SEC = 120;
export const AHEAD_MAX_SEC = 180;

/** Whether to make the next sentence, given what is made ahead and whether making is already under way. */
export function shouldMakeMore({ aheadSec, rate, making }: { aheadSec: number; rate: number; making: boolean }): boolean {
  const heard = aheadSec / (rate > 0 ? rate : 1);
  return heard < (making ? AHEAD_MAX_SEC : AHEAD_MIN_SEC);
}
