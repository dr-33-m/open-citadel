/**
 * Where the line introducing a card goes.
 *
 * A proposal turn reads card first, then Samwell's line about it. The reply
 * lands in the transcript above the card, so with a card on screen the last
 * reply is held out of the list and drawn under the card instead. Otherwise
 * the card shoves the message off the top of the view, and the reader scrolls
 * up past a plan to read the sentence introducing it.
 */
export function holdCardReply<T extends { role: string }>(
  turns: T[],
  hasCard: boolean,
): { turns: T[]; trailingReply: T | null } {
  const last = turns[turns.length - 1];
  if (!hasCard || last?.role !== 'assistant') return { turns, trailingReply: null };
  return { turns: turns.slice(0, -1), trailingReply: last };
}
