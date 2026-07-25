import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import type { CompassScheduleStatus, CompassTelemetry } from 'samwell-shared';

import { formatCompassDate, paceVerdict, SCORE_RED } from '@/components/compass/format';
import { ThemedText } from '@/components/themed-text';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { computeProgress } from '@/services/compass-math';
import type { CompassMilestoneRow } from '@/stores/compass';

type ProgressSheetProps = {
  visible: boolean;
  onClose: () => void;
  goalTitle: string;
  milestone: CompassMilestoneRow;
  telemetry: CompassTelemetry | null;
  onAdjustDates: (which: 'milestone' | 'goal') => void;
  onArchiveGoal: () => void;
};

export function ProgressSheet({
  visible,
  onClose,
  goalTitle,
  milestone,
  telemetry,
  onAdjustDates,
  onArchiveGoal,
}: ProgressSheetProps) {
  const colors = useColors();
  const [confirmArchive, setConfirmArchive] = React.useState(false);

  // Reset the two-tap confirm whenever the sheet is dismissed.
  React.useEffect(() => {
    if (!visible) setConfirmArchive(false);
  }, [visible]);

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, justifyContent: 'flex-end' },
        overlay: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
        },
        panel: {
          backgroundColor: colors.surface.low,
          paddingHorizontal: spacing[6],
          paddingTop: spacing[4],
          paddingBottom: spacing[10],
          gap: spacing[6],
        },
        grabber: {
          width: 40,
          height: 4,
          backgroundColor: colors.surface.highest,
          alignSelf: 'center',
        },
        section: { gap: spacing[2] },
        progressNumbers: {
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: spacing[3],
        },
        pace: {
          gap: spacing[2],
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.outline.variant,
          paddingTop: spacing[5],
        },
        sectionHead: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing[3],
        },
        archive: {
          gap: spacing[2],
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.outline.variant,
          paddingTop: spacing[5],
        },
      }),
    [colors],
  );

  const progress = computeProgress(
    milestone.completedEffortUnits,
    milestone.estimatedEffortUnits,
  );
  const percent = Math.round(progress * 100);
  const completed = Math.round(milestone.completedEffortUnits * 10) / 10;

  const status = telemetry?.scheduleStatus ?? 'unknown';
  const variance = telemetry?.varianceDays ?? null;
  const paceTint = (s: CompassScheduleStatus) =>
    s === 'behind'
      ? '#e53935'
      : s === 'ahead'
        ? '#4caf50'
        : s === 'unknown'
          ? colors.text.secondary
          : colors.primary.default;
  const paceColor = paceTint(status);
  const goalTrack = telemetry?.goalTrack ?? null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Touchable style={styles.overlay} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.grabber} />

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <ThemedText type="labelSm" color={colors.text.secondary}>
                GOAL
              </ThemedText>
              {goalTrack && (
                <Touchable onPress={() => onAdjustDates('goal')}>
                  <ThemedText type="labelSm" color={colors.primary.default}>
                    ADJUST DATE
                  </ThemedText>
                </Touchable>
              )}
            </View>
            <ThemedText type="bodyMd" color={colors.text.secondary}>
              {goalTitle}
            </ThemedText>
            {goalTrack && (
              <>
                <ThemedText type="bodySm" color={paceTint(goalTrack.scheduleStatus)}>
                  {paceVerdict(goalTrack.scheduleStatus, goalTrack.varianceDays)}
                </ThemedText>
                <ThemedText type="bodySm" color={colors.text.secondary}>
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

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <ThemedText type="labelSm" color={colors.text.secondary}>
                MILESTONE
              </ThemedText>
              <Touchable onPress={() => onAdjustDates('milestone')}>
                <ThemedText type="labelSm" color={colors.primary.default}>
                  ADJUST DATE
                </ThemedText>
              </Touchable>
            </View>
            <ThemedText type="headlineMd">{milestone.title}</ThemedText>
          </View>

          <View style={styles.section}>
            <View style={styles.progressNumbers}>
              <ThemedText type="displayMd">{percent}%</ThemedText>
              <ThemedText type="labelSm" color={colors.text.secondary}>
                {completed} of {milestone.estimatedEffortUnits} steps
              </ThemedText>
            </View>
            <ProgressBar progress={progress} />
          </View>

          <View style={styles.pace}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              PACE
            </ThemedText>
            <ThemedText type="headlineSm" color={paceColor}>
              {paceVerdict(status, variance)}
            </ThemedText>
            {telemetry && (
              <ThemedText type="bodySm" color={colors.text.secondary}>
                Target {formatCompassDate(telemetry.targetDate)}
                {telemetry.currentProjectedDate
                  ? `, now projected ${formatCompassDate(telemetry.currentProjectedDate)}`
                  : ''}
              </ThemedText>
            )}
          </View>

          <View style={styles.archive}>
            <Touchable
              onPress={() => (confirmArchive ? onArchiveGoal() : setConfirmArchive(true))}
            >
              <ThemedText type="labelSm" color={confirmArchive ? SCORE_RED : colors.text.secondary}>
                {confirmArchive ? 'TAP AGAIN TO ARCHIVE' : 'ARCHIVE GOAL'}
              </ThemedText>
            </Touchable>
            {confirmArchive && (
              <ThemedText type="bodySm" color={colors.text.secondary}>
                Your check-in history is kept. You can plan a fresh goal after this.
              </ThemedText>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
