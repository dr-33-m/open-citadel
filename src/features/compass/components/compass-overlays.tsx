/**
 * Compass's sheets and date pickers.
 *
 * Two calendars, not one, because they are answering different questions and
 * a single picker would have to be told which. `editingDate` moves a date on
 * a goal that already exists; `calendarFor` fills one in on a goal being set
 * up, which has no stored dates to fall back on and a floor that depends on
 * the milestone chosen a moment earlier.
 */
import React from 'react';

import { ProgressSheet } from '@/components/compass/progress-sheet';
import { CalendarPicker } from '@/components/timeline/calendar-picker';
import type { CompassFlowState } from '@/features/compass/hooks/use-compass-flow';
import { currentCompassDay } from '@/services/compass-day';
import { addDaysYmd } from '@/services/compass-math';

interface CompassOverlaysProps {
  compass: CompassFlowState;
  showProgress: boolean;
  onCloseProgress: () => void;
}

export function CompassOverlays({ compass, showProgress, onCloseProgress }: CompassOverlaysProps) {
  const {
    goal,
    milestone,
    telemetry,
    milestoneDate,
    goalDate,
    setSession,
    updateTargetDates,
    archiveGoal,
    calendarFor,
    setCalendarFor,
    editingDate,
    setEditingDate,
  } = compass;

  /** Nothing to show progress against until both exist. */
  const canShowProgress = milestone != null && goal != null;

  return (
    <>
      {canShowProgress && (
        <ProgressSheet
          visible={showProgress}
          onClose={onCloseProgress}
          goalTitle={goal.title}
          goalActive={goal.status === 'active'}
          milestone={milestone}
          telemetry={telemetry}
          onAdjustDates={(which) => {
            onCloseProgress();
            setEditingDate(which);
          }}
          onArchiveGoal={() => {
            onCloseProgress();
            void archiveGoal();
          }}
        />
      )}

      {/* Moving a date on a goal that is already running. */}
      <CalendarPicker
        visible={editingDate !== null}
        selectedDate={(editingDate === 'goal' ? goal?.targetDate : milestone?.targetDate) ?? ''}
        minDate={addDaysYmd(currentCompassDay(), 1)}
        onSelectDate={(date) => {
          const which = editingDate;
          setEditingDate(null);
          if (which === 'goal') void updateTargetDates({ goalTargetDate: date });
          else if (which === 'milestone') void updateTargetDates({ milestoneTargetDate: date });
        }}
        onClose={() => setEditingDate(null)}
      />

      {/* Filling a date in on a goal being committed. The goal cannot land
          before its own first milestone, so that is the floor once one is
          chosen. */}
      <CalendarPicker
        visible={calendarFor !== null}
        selectedDate={(calendarFor === 'goal' ? goalDate : milestoneDate) ?? ''}
        minDate={
          calendarFor === 'goal' && milestoneDate
            ? milestoneDate
            : addDaysYmd(currentCompassDay(), 1)
        }
        onSelectDate={(date) => {
          if (calendarFor === 'goal') setSession({ goalDate: date });
          else setSession({ milestoneDate: date });
          setCalendarFor(null);
        }}
        onClose={() => setCalendarFor(null)}
      />
    </>
  );
}
