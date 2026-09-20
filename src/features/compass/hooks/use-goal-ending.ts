import React from 'react';

import { writeGoalTakeaway } from '@/services/goal-takeaway';
import { useCompassStore } from '@/stores/compass';

/** One frozen empty set, so a page with nothing in flight keeps its identity. */
const NONE: ReadonlySet<string> = new Set();

/**
 * Ending a goal: the archive write, and Samwell's takeaway on top of it.
 *
 * The two are deliberately not one operation. Archiving is local, instant and
 * cannot fail; the takeaway is a cloud call that can time out, hit the usage
 * cap, or be made with no signal at all. Tying them together would mean a goal
 * you finished on the train did not get finished, which is the worse of the two
 * failures by a long way. So the goal ends first and the takeaway lands when it
 * lands — or never, and the archive page says so.
 *
 * `writing` is the set of goals he is still working on, which is what lets the
 * summary sheet show a placeholder instead of "he has not written one" for a
 * goal that was closed out four seconds ago.
 */
export function useGoalEnding() {
  const finishGoalAction = useCompassStore((s) => s.finishGoal);
  const abandonGoalAction = useCompassStore((s) => s.abandonGoal);

  const [writing, setWriting] = React.useState<ReadonlySet<string>>(NONE);

  /** Samwell's takeaway, with the goal marked as in progress meanwhile. */
  const writeTakeaway = React.useCallback(async (goalId: string) => {
    setWriting((current) => new Set(current).add(goalId));
    try {
      await writeGoalTakeaway(goalId);
    } catch (error) {
      // Swallowed on purpose. The goal is already archived and its page
      // already reads correctly without this; surfacing a failure here would
      // put an error on top of the one moment the app celebrates.
      console.warn('[Compass] takeaway failed', error);
    } finally {
      setWriting((current) => {
        const next = new Set(current);
        next.delete(goalId);
        return next.size === 0 ? NONE : next;
      });
    }
  }, []);

  const finishGoal = React.useCallback(
    async (goalId: string) => {
      await finishGoalAction(goalId);
      void writeTakeaway(goalId);
    },
    [finishGoalAction, writeTakeaway],
  );

  const abandonGoal = React.useCallback(
    async (goalId: string, reason: string | null) => {
      await abandonGoalAction(goalId, reason);
      void writeTakeaway(goalId);
    },
    [abandonGoalAction, writeTakeaway],
  );

  return {
    finishGoal,
    abandonGoal,
    writingTakeaway: writing,
    /** Ask again for one that never arrived. Offered on the archive page. */
    retryTakeaway: writeTakeaway,
  };
}
