import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { fontFamily, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

export function PitWallCard({ message }: { message: string }) {
  const colors = useColors();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface.low,
          borderLeftWidth: 2,
          borderLeftColor: colors.primary.default,
          padding: spacing[4],
          gap: spacing[2],
        },
        message: {
          fontFamily: fontFamily.serifItalic,
          fontSize: 18,
          lineHeight: 26,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.card}>
      <ThemedText type="labelSm" color={colors.primary.default}>
        PIT WALL
      </ThemedText>
      <ThemedText style={styles.message}>{message}</ThemedText>
    </View>
  );
}
