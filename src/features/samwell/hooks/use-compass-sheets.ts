import React from 'react';

import { useGoalEnding } from '@/features/compass/hooks/use-goal-ending';
import { useCompassPastGoals, useCompassStore } from '@/stores/compass';
import { useSamwellSheet } from '@/stores/samwell-ui';

/** The month of what was done, drawn from every active goal's activities. */
export function usePlannerSheet() {
  const sheet = useSamwellSheet('planner');
  const trackables = useCompassStore((s) => s.trackables);
  const logsByTrackable = useCompassStore((s) => s.logsByTrackable);
  return { ...sheet, trackables, logsByTrackable };
}

/**
 * Insights, the overview and the archive: the three sheets about the goals.
 *
 * One hook for the three because ending a goal is shared among them. The
 * takeaway Samwell writes once a goal ends is started from Insights or the
 * overview and waited on in the archive, so `useGoalEnding`'s set of goals in
 * progress has to be the same set in all three.
 */
export function useCompassGoalSheets() {
  const insights = useSamwellSheet('insights');
  const overview = useSamwellSheet('overview');
  const pastGoals = useSamwellSheet('past-goals');

  const goals = useCompassStore((s) => s.activeGoals);
  const primaryGoalId = useCompassStore((s) => s.primaryGoalId);
  const consistencyByGoal = useCompassStore((s) => s.consistencyByGoal);
  const setPrimaryGoal = useCompassStore((s) => s.setPrimaryGoal);
  const entries = useCompassPastGoals();
  const { finishGoal, abandonGoal, writingTakeaway, retryTakeaway } = useGoalEnding();

  // The goal the single-goal Insights is about: the primary, or the only one.
  const goal = goals.find((g) => g.id === primaryGoalId) ?? goals[0] ?? null;
  const consistency = goal ? (consistencyByGoal.get(goal.id) ?? null) : null;

  const onMakePrimary = React.useCallback((goalId: string) => void setPrimaryGoal(goalId), [setPrimaryGoal]);
  const onRetryTakeaway = React.useCallback((goalId: string) => void retryTakeaway(goalId), [retryTakeaway]);

  return {
    /** Whether any of the three is up, so they mount on the first of them. */
    anyVisible: insights.visible || overview.visible || pastGoals.visible,
    insights: { ...insights, goal, consistency, onFinishGoal: finishGoal, onAbandonGoal: abandonGoal },
    overview: { ...overview, goals, primaryGoalId, consistencyByGoal, onMakePrimary, onFinishGoal: finishGoal, onAbandonGoal: abandonGoal },
    pastGoals: { ...pastGoals, entries, writingTakeaway, onRetryTakeaway },
  };
}
