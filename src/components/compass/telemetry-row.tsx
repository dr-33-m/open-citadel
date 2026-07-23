import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CompassScheduleStatus } from 'samwell-shared';

import { ThemedText } from '@/components/themed-text';
import { formatCompassDate, formatVariance } from '@/components/compass/format';
import { StatusChip } from '@/components/compass/status-chip';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

type TelemetryRowProps = {
  targetDate: string;
  projectedDate: string | null;
  status: CompassScheduleStatus;
  varianceDays: number | null;
};

export function TelemetryRow({ targetDate, projectedDate, status, varianceDays }: TelemetryRowProps) {
  const colors = useColors();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: spacing[2],
        },
        datesRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing[3],
        },
      }),
    [],
  );

  return (
    <View style={styles.container}>
      <View style={styles.datesRow}>
        <ThemedText type="labelSm" color={colors.text.secondary}>
          TARGET {formatCompassDate(targetDate)}
          {projectedDate ? `  ·  PROJECTED ${formatCompassDate(projectedDate)}` : ''}
        </ThemedText>
        <StatusChip status={status} />
      </View>
      <ThemedText type="bodySm" color={colors.text.secondary}>
        {varianceDays === null
          ? 'Not enough execution data to project accurately.'
          : formatVariance(varianceDays)}
      </ThemedText>
    </View>
  );
}
