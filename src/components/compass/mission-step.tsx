import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CompassMissionStep } from 'samwell-shared';

import { missionIcon } from '@/components/compass/mission-icon';
import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

export function MissionStep({
  index,
  step,
  showIcon = true,
}: {
  index: number;
  step: CompassMissionStep;
  showIcon?: boolean;
}) {
  const colors = useColors();
  const Icon = missionIcon(step.icon);

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          backgroundColor: colors.surface.mid,
          padding: spacing[3],
        },
        number: {
          width: 24,
          height: 24,
          borderWidth: 1,
          borderColor: colors.primary.default,
          alignItems: 'center',
          justifyContent: 'center',
        },
        iconWrap: {
          width: 36,
          height: 36,
          backgroundColor: colors.surface.highest,
          alignItems: 'center',
          justifyContent: 'center',
        },
        text: { flex: 1, gap: 2 },
      }),
    [colors],
  );

  return (
    <View style={styles.row}>
      <View style={styles.number}>
        <ThemedText type="labelSm" color={colors.primary.default}>
          {index}
        </ThemedText>
      </View>
      {showIcon && (
        <View style={styles.iconWrap}>
          <Icon size={18} color={colors.text.primary} />
        </View>
      )}
      <View style={styles.text}>
        <ThemedText type="bodyMd">{step.title}</ThemedText>
        {step.detail.length > 0 && (
          <ThemedText type="bodySm" color={colors.text.secondary}>
            {step.detail}
          </ThemedText>
        )}
      </View>
    </View>
  );
}
