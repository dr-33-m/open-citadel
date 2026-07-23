import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatCompassDate } from '@/components/compass/format';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import type { CompassCheckinRow } from '@/stores/compass';

export function CheckinSummaryRow({ checkin }: { checkin: CompassCheckinRow }) {
  const colors = useColors();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          paddingVertical: spacing[2],
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.outline.variant,
        },
        date: {
          width: 64,
        },
        kind: {
          width: 56,
        },
        spacer: {
          flex: 1,
        },
      }),
    [colors],
  );

  const units =
    checkin.kind === 'night' && checkin.effortUnitsCompleted != null
      ? `+${Math.round(checkin.effortUnitsCompleted * 10) / 10}`
      : null;

  return (
    <View style={styles.row}>
      <ThemedText type="labelSm" color={colors.text.secondary} style={styles.date}>
        {formatCompassDate(checkin.localDate)}
      </ThemedText>
      <ThemedText type="labelSm" color={colors.primary.default} style={styles.kind}>
        {checkin.kind === 'morning' ? 'PLAN' : 'REPORT'}
      </ThemedText>
      <View style={styles.spacer} />
      {units !== null && (
        <ThemedText type="labelSm" color={colors.text.secondary}>
          {units} UNITS
        </ThemedText>
      )}
      {checkin.focusScore != null && (
        <ThemedText type="labelSm" color={colors.text.primary}>
          {checkin.focusScore}%
        </ThemedText>
      )}
    </View>
  );
}
