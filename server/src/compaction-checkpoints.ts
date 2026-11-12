/**
 * Where a long conversation's summary waits between its requests.
 *
 * In memory, as opencode keeps its held summaries: losing one to a restart
 * costs a single summary written again from the start, and nothing about the
 * conversation is lost, since the app sends all of it with every request. A
 * summary is the reader's conversation in other words, so it is kept no
 * longer than a conversation is likely to carry on, and never written to disk.
 */
import type { Checkpoint, CheckpointStore } from './compaction.js';

/** A conversation quiet for this long starts its summary again. */
const CHECKPOINT_TTL_MS = 12 * 60 * 60_000;
/** Conversations held at once. The oldest goes first. */
const MAX_CHECKPOINTS = 2_000;

type Held = Checkpoint & { at: number };

const held = new Map<string, Held>();

/**
 * One conversation's store, or none without a thread to key it by (a
 * request with no thread has no next request to share a summary with).
 */
export function threadCheckpoints(
  accountId: string,
  threadId: string | undefined,
  now: () => number = Date.now,
): CheckpointStore | undefined {
  if (!threadId) return undefined;
  const key = `${accountId}\u0000${threadId}`;

  return {
    get() {
      const entry = held.get(key);
      if (!entry) return undefined;
      if (now() - entry.at > CHECKPOINT_TTL_MS) {
        held.delete(key);
        return undefined;
      }
      return entry;
    },
    set(checkpoint) {
      // Deleted first so the Map's order is the order of use.
      held.delete(key);
      held.set(key, { ...checkpoint, at: now() });
      while (held.size > MAX_CHECKPOINTS) {
        const oldest = held.keys().next().value;
        if (oldest === undefined) break;
        held.delete(oldest);
      }
    },
  };
}

/** For tests: forget every held summary. */
export function clearCheckpoints(): void {
  held.clear();
}
