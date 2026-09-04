import React from 'react';

import type { LogView, TrackableView } from '@/services/occurrences';
import { readGoals, useCompassStore } from '@/stores/compass';

/**
 * One goal's trackables and logs, for an Insights view that is not scoped to
 * the goal Compass is currently pointed at.
 *
 * The store holds the viewed goal's views only, so the overview's per-goal
 * tabs read the others on demand — the same batched read Samwell's tools use.
 * The viewed goal costs nothing: its data is already riding in the store, and
 * following it keeps the tab honest across switches.
 */
export function useGoalInsights(goalId: string | null): {
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
} | null {
  const activeGoalId = useCompassStore((s) => s.activeGoalId);
  const activeTrackables = useCompassStore((s) => s.trackables);
  const activeLogs = useCompassStore((s) => s.logsByTrackable);

  return React.useMemo(() => {
    if (!goalId) return null;
    if (goalId === activeGoalId) {
      return { trackables: activeTrackables, logsByTrackable: activeLogs };
    }
    const data = readGoals([goalId]).get(goalId);
    return data
      ? { trackables: data.views, logsByTrackable: data.logsByTrackable }
      : { trackables: [], logsByTrackable: new Map() };
  }, [goalId, activeGoalId, activeTrackables, activeLogs]);
}
