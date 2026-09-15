import React from 'react';

import { requestGoalTakeaway } from '@/services/goal-takeaway';
import { categoryLabel } from '@/features/compass/utils/category';
import { scheduleSummary } from '@/services/occurrences';
import { readGoals, useCompassStore } from '@/stores/compass';

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
  const saveTakeaway = useCompassStore((s) => s.saveTakeaway);

  const [writing, setWriting] = React.useState<ReadonlySet<string>>(NONE);

  /**
   * Ask Samwell what he made of it, from the goal as it stood before the
   * archive.
   *
   * Read out of the store rather than passed in: this runs after the store
   * action has already reloaded, so the caller's copy of the goal may be a
   * render behind. `goals` keeps archived goals, and `goal_outcomes` now holds
   * the frozen figures, so everything the prompt needs survives the archiving.
   */
  const writeTakeaway = React.useCallback(
    async (goalId: string) => {
      const state = useCompassStore.getState();
      const goal = state.goals.find((g) => g.id === goalId);
      const entry = state.pastGoals.find((p) => p.goal.id === goalId);
      if (!goal || !entry) return;

      const { outcome } = entry;
      // Read from the database, not from `dataByGoal`: that map only holds
      // ACTIVE goals, and this one was archived a moment ago.
      const data = readGoals([goalId]).get(goalId);
      const activities = (data?.views ?? [])
        .map((t) => `- ${t.title} (${scheduleSummary(t.schedule)})`)
        .join('\n');

      setWriting((current) => new Set(current).add(goalId));
      try {
        const takeaway = await requestGoalTakeaway({
          title: goal.title,
          category: categoryLabel(goal.category),
          completed: outcome.completed === 1,
          startDate: goal.startDate,
          endedOn: outcome.endedOn,
          consistencyPct:
            outcome.executionRatio == null
              ? null
              : Math.round(outcome.executionRatio * 100),
          outcomeSummary:
            outcome.outcomeValue != null && outcome.outcomeTarget != null
              ? `${outcome.outcomeValue} of ${outcome.outcomeTarget} ${outcome.outcomeUnit ?? ''}`.trim()
              : null,
          reason: outcome.reason,
          activities: activities.slice(0, 2000),
        });
        await saveTakeaway(goalId, takeaway);
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
    },
    [saveTakeaway],
  );

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
