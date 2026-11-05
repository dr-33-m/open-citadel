/**
 * How many exchanges the transcript's skeleton stacks to cover a screen. Pure.
 *
 * Counted from the window's height, as Expensify's chat skeleton counts its
 * rows, so a tall phone is filled as fully as a short one. One more than fits,
 * since the stack is clipped at the top rather than ending short of it.
 */

/** An exchange's drawn height: a question bubble, three or four lines, and the gaps. */
const EXCHANGE_HEIGHT = 168;

export function skeletonExchanges(windowHeight: number): string[] {
  const count = Math.max(1, Math.ceil(windowHeight / EXCHANGE_HEIGHT) + 1);
  return Array.from({ length: count }, (_, index) => `exchange-${index}`);
}
