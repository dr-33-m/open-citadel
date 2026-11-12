/**
 * How many rows gain their swipe each frame once a sheet has landed. Each is
 * a pan gesture, seven animated values and four animated styles, and its row
 * remounts inside it; a whole screenful at once was the hitch as History
 * landed. Three a frame arms a screenful in about four frames.
 */
export const ROWS_PER_FRAME = 3;

/**
 * The next count of armed rows (those with an index below it). Pure.
 *
 * Infinity once every row is armed, so a chat added or scrolled into view
 * later comes up armed at once rather than restarting the count.
 */
export function nextArmed(armed: number, total: number): number {
  const next = armed + ROWS_PER_FRAME;
  return next >= total ? Infinity : next;
}
