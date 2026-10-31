import type { JournalNote } from 'samwell-shared';

import { planJournalEntry, type JournalMessage, type JournalPlan } from '@/utils/journal-plan';

/**
 * One pass of Samwell's journal over the conversations waiting for it: which
 * are written up, when it stops, and what a failure costs. The database and the
 * network are handed in (`journey-writer`), so all of that can be tested.
 */

/** Each is one cloud call; the rest wait for the next sweep. */
const MAX_WRITES_PER_SWEEP = 3;
/** Answers refused for one conversation before it waits for the next launch. */
const MAX_STRIKES = 3;

/** The server says this account may not write, which will not change until the plan does. */
export class JournalRefused extends Error {}
/**
 * The server answered, and not with notes. It may be about this conversation
 * alone, so the ones behind it still get their turn. Anything else that fails
 * (offline, a timeout) is about every conversation, and ends the sweep.
 */
export class JournalRejected extends Error {}

export type SweepSession = {
  id: string;
  kind: 'reading' | 'compass' | 'onboarding';
  bookId: string | null;
  journaledAt: string | null;
};

export type SweepDeps = {
  /** The conversations with something unread, newest first. */
  sessions: () => SweepSession[];
  /** Everything said since the watermark, oldest first. */
  fresh: (session: SweepSession) => JournalMessage[];
  /** The few messages just ahead of the watermark. */
  before: (session: SweepSession) => JournalMessage[];
  request: (session: SweepSession, plan: JournalPlan) => Promise<JournalNote[]>;
  exists: (sessionId: string) => boolean;
  /** The notes and the watermark, together or not at all. */
  commit: (sessionId: string, notes: JournalNote[], through: string) => void;
};

/** Times each conversation was refused, for as long as this runtime lasts. */
export type JournalStrikes = Map<string, number>;

/** Whether the account was refused; every other ending is left for the next sweep. */
export async function sweepJournal(
  deps: SweepDeps,
  { quietMs, now, strikes }: { quietMs: number; now: number; strikes: JournalStrikes },
): Promise<{ refused: boolean }> {
  let writes = 0;
  for (const session of deps.sessions()) {
    if (writes >= MAX_WRITES_PER_SWEEP) break;
    if ((strikes.get(session.id) ?? 0) >= MAX_STRIKES) continue;

    const fresh = deps.fresh(session);
    if (fresh.length === 0) continue;
    const plan = planJournalEntry({ fresh, before: session.journaledAt ? deps.before(session) : [], now, quietMs });
    if (!plan) continue;

    let notes: JournalNote[] = [];
    if (plan.conversation) {
      writes += 1;
      try {
        notes = await deps.request(session, plan);
      } catch (error) {
        console.warn('[Journal] write-up failed', error);
        if (error instanceof JournalRefused) return { refused: true };
        // The watermark has not moved, so nothing is lost either way.
        if (!(error instanceof JournalRejected)) break;
        strikes.set(session.id, (strikes.get(session.id) ?? 0) + 1);
        continue;
      }
      // Deleted while the request was out: they did not want it kept.
      if (!deps.exists(session.id)) continue;
    }
    deps.commit(session.id, notes, plan.through);
    strikes.delete(session.id);
  }
  return { refused: false };
}
