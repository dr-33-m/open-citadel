import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';

import { ThemedText } from '@/components/themed-text';
import { asColor } from '@/utils/colors';
import { spacing } from '@/constants/theme';

type GoldButtonProps = {
  label: string;
  onPress?: () => void;
};

export function GoldButton({ label, onPress }: GoldButtonProps) {
  const [primary, primaryDeep, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-primary-deep',
    '--color-primary-foreground',
  ]);
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        gradient: {
          minHeight: 56,
          paddingHorizontal: spacing[6],
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [],
  );

  return (
    <Touchable onPress={onPress} haptic="commit">
      <LinearGradient
        colors={[asColor(primary)!, asColor(primaryDeep)!]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <ThemedText type="labelLg" color={asColor(primaryForeground)}>
          {label}
        </ThemedText>
      </LinearGradient>
    </Touchable>
  );
}
