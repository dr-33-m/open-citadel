import React from 'react';

import { Archive, CalendarDays, Compass, Goal, Info, ListTodo, TrendingUp } from '@/components/icons';
import type { ToolboxItem } from '@/components/samwell/samwell-toolbox';
import type { CloudBlocker } from '@/features/chat/hooks/use-samwell-readiness';
import { composerInput } from '@/features/samwell/handles';
import { compassBlockedDetail } from '@/features/samwell/utils/compass-blocked';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { useCompassPastGoals, useCompassStore } from '@/stores/compass';
import { useSamwellUiStore, type SamwellSheet } from '@/stores/samwell-ui';

const NONE: ToolboxItem[] = [];

/** How a goal starts: the reader finishes the sentence, Samwell takes it from there. */
const GOAL_OPENER = 'I want to work on ';

/** Puts the opener in the composer and the cursor after it, with the drawer away. */
function startGoal() {
  useSamwellSessionStore.getState().set({ draft: GOAL_OPENER });
  useSamwellUiStore.getState().setToolboxOpen(false);
  composerInput.current?.focus();
}

/**
 * The drawer's Compass section: today's log, the planner, insights and the
 * archive of goals that ended.
 *
 * Compass is cloud only. Without the cloud the tab is one row saying why,
 * which opens About Compass, so goals are never a feature nobody can find.
 * With no goal running there is nothing to log, plan or read yet, so the tab
 * is the way to start one instead of three rows that do nothing.
 * Reads counts, not the goals themselves, so a streamed token redraws none of
 * it.
 */
export function useCompassToolbox(blocker: CloudBlocker | null): ToolboxItem[] {
  const openSheet = useSamwellUiStore((s) => s.openSheet);
  const activeGoalCount = useCompassStore((s) => s.activeGoals.length);
  const dueCount = useCompassStore((s) => s.due.length);
  const trackableCount = useCompassStore((s) => s.trackables.length);
  const pastGoalCount = useCompassPastGoals().length;

  return React.useMemo(() => {
    const opener = (sheet: SamwellSheet) => () => openSheet(sheet);
    if (blocker) {
      const detail = compassBlockedDetail(blocker);
      if (detail == null) return NONE;
      return [{ id: 'about-compass', icon: Compass, label: 'Compass', detail, onPress: opener('about-compass') }];
    }
    const pastGoals: ToolboxItem[] =
      // Only once something has ended: an empty archive teaches nobody anything.
      pastGoalCount > 0
        ? [{ id: 'past-goals', icon: Archive, label: 'Past goals', detail: `${pastGoalCount} closed`, onPress: opener('past-goals') }]
        : NONE;
    if (activeGoalCount === 0) {
      return [
        { id: 'set-goal', icon: Goal, label: 'Set a goal', lead: true, detail: 'With Samwell', onPress: startGoal },
        { id: 'about-compass', icon: Info, label: 'About Compass', onPress: opener('about-compass') },
        ...pastGoals,
      ];
    }
    const loggable = dueCount > 0;
    return [
      {
        id: 'deck',
        // What Compass is for, so it leads its section at full width.
        icon: ListTodo,
        label: 'Log today',
        lead: true,
        detail: dueCount > 0 ? `${dueCount} to log` : 'All done',
        active: loggable,
        onPress: loggable ? opener('deck') : undefined,
      },
      {
        id: 'planner',
        icon: CalendarDays,
        label: 'Planner',
        detail: `${trackableCount} ${trackableCount === 1 ? 'activity' : 'activities'}`,
        onPress: opener('planner'),
      },
      {
        id: 'insights',
        icon: TrendingUp,
        label: 'Insights',
        detail: `${activeGoalCount} ${activeGoalCount === 1 ? 'goal' : 'goals'}`,
        // One goal is that goal's Insights; two or more, the overview of the set.
        onPress: opener(activeGoalCount >= 2 ? 'overview' : 'insights'),
      },
      ...pastGoals,
    ];
  }, [blocker, activeGoalCount, dueCount, trackableCount, pastGoalCount, openSheet]);
}
