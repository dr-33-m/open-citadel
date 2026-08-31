import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompassScheduleStatus, CompassTelemetry } from 'samwell-shared';

import { formatCompassDate, paceVerdict } from '@/components/compass/format';
import { ThemedText } from '@/components/themed-text';
import { Progress } from '@/components/ui/progress';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import {
  computeProgress,
  isGoalComplete,
  isMilestoneFullyStepped,
} from '@/services/compass-math';
import type { CompassMilestoneRow } from '@/stores/compass';

type ProgressSheetProps = {
  visible: boolean;
  onClose: () => void;
  goalTitle: string;
  goalActive: boolean;
  milestone: CompassMilestoneRow;
  telemetry: CompassTelemetry | null;
  onAdjustDates: (which: 'milestone' | 'goal') => void;
  onArchiveGoal: () => void;
};

export function ProgressSheet({
  visible,
  onClose,
  goalTitle,
  goalActive,
  milestone,
  telemetry,
  onAdjustDates,
  onArchiveGoal,
}: ProgressSheetProps) {
  const [confirmArchive, setConfirmArchive] = React.useState(false);

  // ThemedText's `color` prop needs a literal value, not a className —
  // resolve the tokens this screen uses once, up front.
  const mutedForegroundVar = useCSSVariable('--color-muted-foreground');
  const primaryVar = useCSSVariable('--color-primary');
  const successVar = useCSSVariable('--color-success');
  const destructiveVar = useCSSVariable('--color-destructive');
  const mutedForeground = typeof mutedForegroundVar === 'string' ? mutedForegroundVar : undefined;
  const primary = typeof primaryVar === 'string' ? primaryVar : undefined;
  const success = typeof successVar === 'string' ? successVar : undefined;
  const destructive = typeof destructiveVar === 'string' ? destructiveVar : undefined;

  // Reset the two-tap confirm whenever the sheet is dismissed.
  React.useEffect(() => {
    if (!visible) setConfirmArchive(false);
  }, [visible]);

  const progress = computeProgress(
    milestone.completedEffortUnits,
    milestone.estimatedEffortUnits,
  );
  const percent = Math.round(progress * 100);
  const completed = Math.round(milestone.completedEffortUnits * 10) / 10;

  const status = telemetry?.scheduleStatus ?? 'unknown';
  const variance = telemetry?.varianceDays ?? null;
  // Same pace-colour psychology as before (behind=red, ahead=green,
  // unknown=muted, on-track=gold) — only the literal hexes moved to the
  // theme's own semantic tokens.
  const paceTint = (s: CompassScheduleStatus) =>
    s === 'behind' ? destructive : s === 'ahead' ? success : s === 'unknown' ? mutedForeground : primary;
  const paceColor = paceTint(status);
  const goalTrack = telemetry?.goalTrack ?? null;
  // Count the active milestone when its steps are all logged: archiving will
  // close it out too, so the label must promise the rank that will be awarded.
  const goalComplete = goalTrack
    ? isGoalComplete(
        goalTrack.completedMilestones + (isMilestoneFullyStepped(milestone) ? 1 : 0),
        goalTrack.estimatedMilestones,
      )
    : false;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-6 px-6">
        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <ThemedText type="labelSm" color={mutedForeground}>
              GOAL
            </ThemedText>
            {goalTrack && goalActive && (
              <Touchable onPress={() => onAdjustDates('goal')} hitSlop={12}>
                <ThemedText type="labelSm" color={primary}>
                  ADJUST DATE
                </ThemedText>
              </Touchable>
            )}
          </View>
          <ThemedText type="bodyMd" color={mutedForeground}>
            {goalTitle}
          </ThemedText>
          {goalTrack && (
            <>
              <ThemedText type="bodySm" color={paceTint(goalTrack.scheduleStatus)}>
                {paceVerdict(goalTrack.scheduleStatus, goalTrack.varianceDays)}
              </ThemedText>
              <ThemedText type="bodySm" color={mutedForeground} style={{ fontVariant: ['tabular-nums'] }}>
                {Math.round(goalTrack.milestonesDone * 10) / 10} of{' '}
                {goalTrack.estimatedMilestones} milestones · target{' '}
                {formatCompassDate(goalTrack.targetDate)}
                {goalTrack.currentProjectedDate
                  ? `, now projected ${formatCompassDate(goalTrack.currentProjectedDate)}`
                  : ''}
              </ThemedText>
            </>
          )}
        </View>

        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <ThemedText type="labelSm" color={mutedForeground}>
              MILESTONE
            </ThemedText>
            {milestone.status === 'active' && (
              <Touchable onPress={() => onAdjustDates('milestone')} hitSlop={12}>
                <ThemedText type="labelSm" color={primary}>
                  ADJUST DATE
                </ThemedText>
              </Touchable>
            )}
          </View>
          <ThemedText type="headlineMd">{milestone.title}</ThemedText>
        </View>

        <View className="gap-2">
          <View className="flex-row items-baseline gap-3">
            <ThemedText type="displayMd" style={{ fontVariant: ['tabular-nums'] }}>{percent}%</ThemedText>
            <ThemedText type="labelSm" color={mutedForeground} style={{ fontVariant: ['tabular-nums'] }}>
              {completed} of {milestone.estimatedEffortUnits} steps
            </ThemedText>
          </View>
          <Progress value={progress} minValue={0} maxValue={1} size="sm" />
        </View>

        <View className="gap-2 border-t border-border pt-5">
          <ThemedText type="labelSm" color={mutedForeground}>
            PACE
          </ThemedText>
          <ThemedText type="headlineSm" color={paceColor}>
            {paceVerdict(status, variance)}
          </ThemedText>
          {telemetry && (
            <ThemedText type="bodySm" color={mutedForeground}>
              Target {formatCompassDate(telemetry.targetDate)}
              {telemetry.currentProjectedDate
                ? `, now projected ${formatCompassDate(telemetry.currentProjectedDate)}`
                : ''}
            </ThemedText>
          )}
        </View>

        <View className="gap-2 border-t border-border pt-5">
          <Touchable
            onPress={() => (confirmArchive ? onArchiveGoal() : setConfirmArchive(true))}
            hitSlop={12}
          >
            <ThemedText type="labelSm" color={confirmArchive ? destructive : mutedForeground}>
              {confirmArchive
                ? 'TAP AGAIN TO ARCHIVE'
                : goalComplete
                  ? 'COMPLETE GOAL'
                  : 'ABANDON GOAL'}
            </ThemedText>
          </Touchable>
          {confirmArchive && (
            <ThemedText type="bodySm" color={mutedForeground}>
              {goalComplete
                ? 'Your check-in history is kept, and this counts toward your rank.'
                : "Your check-in history is kept, but this goal hasn't reached its planned scope, so it won't earn a rank."}
            </ThemedText>
          )}
        </View>
      </View>
    </Sheet>
  );
}
