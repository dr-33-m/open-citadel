/**
 * How much of a conversation is drawn: a page at a time, from the newest
 * back. Pure.
 *
 * Bluesky draws a conversation 30 messages to a page and Expensify a window
 * around the screen, each loading older ones as the reader scrolls up. A page
 * of Samwell's here is measured in text rather than in turns, since one reply
 * can be a line or a screen: on a Galaxy A33 the cost of opening a chat grew
 * with how much text was laid out, about a second and a half for a 16-turn
 * chat on a debug build even with the replies drawn as plain text.
 */

/**
 * Characters of turns to a page: two screens or more of replies, so the first
 * page always fills the view and the reader has room to scroll before the next
 * one is needed.
 */
export const PAGE_CHARS = 1_600;

/**
 * Where the page that ends just before `end` begins: turns taken from `end`
 * backwards until they hold `budget` characters, and always at least one.
 */
export function pageStart(turns: readonly { content: string }[], end: number, budget: number = PAGE_CHARS): number {
  let index = Math.min(end, turns.length);
  let chars = 0;
  while (index > 0 && chars < budget) {
    index -= 1;
    chars += turns[index].content.length;
  }
  return index;
}
