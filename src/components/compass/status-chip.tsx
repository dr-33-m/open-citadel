import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CompassScheduleStatus } from 'samwell-shared';

import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

const LABELS: Record<CompassScheduleStatus, string> = {
  ahead: 'AHEAD',
  on_track: 'ON TRACK',
  behind: 'BEHIND',
  unknown: 'NO DATA',
};

export function StatusChip({ status }: { status: CompassScheduleStatus }) {
  const colors = useColors();
  const color =
    status === 'behind'
      ? '#e53935'
      : status === 'unknown'
        ? colors.text.secondary
        : status === 'ahead'
          ? '#4caf50'
          : colors.primary.default;

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        chip: {
          borderWidth: 1,
          paddingHorizontal: spacing[2],
          paddingVertical: spacing[1],
          alignSelf: 'flex-start',
        },
      }),
    [],
  );

  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <ThemedText type="labelSm" color={color}>
        {LABELS[status]}
      </ThemedText>
    </View>
  );
}
