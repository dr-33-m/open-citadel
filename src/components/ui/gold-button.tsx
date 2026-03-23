import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';

type GoldButtonProps = {
  label: string;
  onPress?: () => void;
};

export function GoldButton({ label, onPress }: GoldButtonProps) {
  const colors = useColors();
  const styles = React.useMemo(() => StyleSheet.create({
    gradient: {
      paddingHorizontal: spacing[6],
      paddingVertical: spacing[4],
      alignItems: 'center',
      justifyContent: 'center',
    },
  }), [colors]);

  return (
    <Pressable onPress={onPress}>
      <LinearGradient
        colors={[colors.primary.default, colors.primary.container]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <ThemedText type="labelLg" color={colors.text.inverse}>
          {label}
        </ThemedText>
      </LinearGradient>
    </Pressable>
  );
}
