import React from 'react';

import type { LogView, TrackableView } from '@/services/occurrences';
import { readGoals, useCompassStore } from '@/stores/compass';

/**
 * One goal's trackables and logs, for a view that shows a single goal.
 *
 * Every active goal's data now rides in the store, so opening a goal from the
 * overview costs nothing at all — it used to hold only the goal Compass was
 * pointed at, and every other goal paid a read on first open. A goal that is
 * no longer active, which is how an old goal's Insights are reached, still
 * falls through to the same batched read Samwell's tools use.
 */
export function useGoalInsights(goalId: string | null): {
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
} | null {
  const dataByGoal = useCompassStore((s) => s.dataByGoal);

  return React.useMemo(() => {
    if (!goalId) return null;
    const held = dataByGoal.get(goalId);
    if (held) {
      return { trackables: held.views, logsByTrackable: held.logsByTrackable };
    }
    const data = readGoals([goalId]).get(goalId);
    return data
      ? { trackables: data.views, logsByTrackable: data.logsByTrackable }
      : { trackables: [], logsByTrackable: new Map() };
  }, [goalId, dataByGoal]);
}
