/**
 * How many times one message may go round the tool loop.
 *
 * Samwell's tools run on the device, so the server never sees a loop: it sees
 * a chat request, ends the run at the tool call, and then sees another request
 * carrying the result. A "turn" is that whole run of requests, and until this
 * existed the only thing bounding it was a wall clock in the app
 * (`SETTLE_ABSOLUTE_MS`, ten minutes). Ten minutes at a flash model's speed is
 * a great many round trips.
 *
 * It is not hypothetical. On real traffic the worst single message made 112
 * requests and accumulated 14.6 million prompt tokens, because every
 * continuation re-sends the whole conversation plus every tool result so far.
 * Eleven per cent of turns like it were ninety-one per cent of all spend.
 *
 * With credits that stops being an invisible cost and becomes a reader's
 * balance emptying in one message, which is why the ceiling lands before the
 * metering does.
 *
 * Pure and dependency-free so the counting can be unit tested; the store below
 * is the only stateful part and it is injectable for the same reason.
 */
import { TOOL_LOOP_CEILING, TOOL_LOOP_WINDOW_MS } from 'samwell-shared';

// The ceiling itself lives in samwell-shared, because the app stops at the
// same number and two copies of one decision is how the two would drift.
export { TOOL_LOOP_CEILING, TOOL_LOOP_WINDOW_MS };

export interface TurnProgress {
  /** Continuations seen since the reader last spoke. Zero on their message. */
  continuations: number;
  startedAtMs: number;
  /**
   * When this turn was last touched.
   *
   * Separate from `startedAtMs`, and the distinction is the whole guard. The
   * window means "abandoned", not "old": measuring it from the start would let
   * any turn slower than the window reset its own count while it was still
   * running, which on a frontier model - ten seconds a round trip, two minutes
   * to reach the window - is every turn that could get expensive.
   */
  lastSeenMs: number;
}

export type TurnStore = Map<string, TurnProgress>;

export function turnKey(accountId: string, threadId: string | undefined): string {
  // A request with no thread id cannot be grouped with anything, so it gets a
  // key of its own and is always a first turn. That is the lenient direction:
  // an ungroupable request is never refused for somebody else's loop.
  return `${accountId}::${threadId ?? ''}`;
}

export type LoopDecision =
  | { allowed: true; continuations: number }
  | { allowed: false; continuations: number };

/**
 * Count this request against its turn, and say whether it may proceed.
 *
 * `isNewUserTurn` is the caller's answer to "did the reader just speak", which
 * `isCountableUserTurn` already works out from the last message's role. A
 * reader speaking resets the count, because their new message is the start of
 * a new turn however long the last one ran.
 */
export function admitRequest(
  store: TurnStore,
  key: string,
  isNewUserTurn: boolean,
  nowMs: number,
  ceiling: number = TOOL_LOOP_CEILING,
): LoopDecision {
  const existing = store.get(key);
  // Idle, not merely long-running. See `lastSeenMs`.
  const abandoned = existing !== undefined && nowMs - existing.lastSeenMs > TOOL_LOOP_WINDOW_MS;

  if (isNewUserTurn || existing === undefined || abandoned) {
    store.set(key, { continuations: 0, startedAtMs: nowMs, lastSeenMs: nowMs });
    return { allowed: true, continuations: 0 };
  }

  const continuations = existing.continuations + 1;
  if (continuations > ceiling) {
    /*
     * Kept, and its clock kept running, so a client that keeps retrying the
     * same spent turn keeps being refused. Touching `lastSeenMs` here is what
     * makes that true: a retry every second would otherwise never let the turn
     * go idle, but neither would it ever be forgiven, and a client that gives
     * up for two minutes has genuinely moved on.
     */
    store.set(key, { ...existing, continuations, lastSeenMs: nowMs });
    return { allowed: false, continuations };
  }

  store.set(key, { continuations, startedAtMs: existing.startedAtMs, lastSeenMs: nowMs });
  return { allowed: true, continuations };
}

/**
 * Drop turns nothing has touched for a while.
 *
 * Without this the map is a slow leak: one entry per thread per server
 * lifetime. Called on a timer rather than per request, so a busy server does
 * not pay for the sweep in front of a reply.
 */
export function sweepTurns(store: TurnStore, nowMs: number): number {
  let dropped = 0;
  for (const [key, progress] of store) {
    if (nowMs - progress.lastSeenMs > TOOL_LOOP_WINDOW_MS) {
      store.delete(key);
      dropped += 1;
    }
  }
  return dropped;
}
