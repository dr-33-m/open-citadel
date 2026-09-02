/**
 * The wire protocol for a streaming Compass turn.
 *
 * Newline-delimited JSON, one event per line, because a Compass turn needs two
 * different things from one request: the reply as it is written, and the
 * structured draft once it validates. A plain JSON response can only carry the
 * second, which is why Compass used to sit behind a spinner while chat streamed.
 *
 * ## Why `restart` exists
 *
 * The turn is structured output, and structured output fails: a reasoning model
 * spends completion tokens thinking before it writes any JSON, so a long turn
 * can run out mid-document and never validate. The non-streaming route absorbed
 * that with a silent second attempt. Nothing was on screen, so nothing had to be
 * taken back.
 *
 * Streaming removes that cover, so the retry is scoped by how far the reply got:
 *
 * - **Failed before the reply finished.** Only an unfinished stream was on
 *   screen, and an unfinished stream is not yet a message. `restart` tells the
 *   client to drop what it has, and the server tries once more.
 * - **Failed after the reply finished.** The message is whole and the reader has
 *   read it; taking it back to show a different one would be worse than the loss.
 *   The turn completes with that reply and a null draft. Only the proposal is
 *   lost, and Samwell can propose again on the next turn.
 * - **Failed twice before the reply finished.** `error`, the same failure the
 *   non-streaming route reported.
 */

export type CompassStreamEvent =
  /** More of the reply. Append it; deltas never overlap and never go back. */
  | { type: 'reply'; delta: string }
  /** Discard the reply so far. A second attempt is starting. */
  | { type: 'restart' }
  /** The turn, validated and normalized. Always the last event of a good run. */
  | { type: 'done'; turn: unknown }
  /** The run failed. `code` matches the non-streaming route's error codes. */
  | { type: 'error'; code: string; reason?: string; usage?: unknown };

/** One event as it goes on the wire. */
export function encodeCompassEvent(event: CompassStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Split a growing NDJSON buffer into whole events.
 *
 * Returns the events that are complete and whatever partial line is left, since
 * a chunk boundary lands mid-line often enough that assuming otherwise silently
 * drops the event that was being written.
 */
export function decodeCompassEvents(buffer: string): {
  events: CompassStreamEvent[];
  rest: string;
} {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events: CompassStreamEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as CompassStreamEvent);
    } catch {
      // A malformed line is one lost event, not a lost turn.
    }
  }
  return { events, rest };
}
