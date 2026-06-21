import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Touchable } from '@/components/ui/touchable';

import { ThemedText } from '@/components/themed-text';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';

type SectionHeaderProps = {
  label?: string;
  title: string;
  rightAction?: {
    text: string;
    onPress: () => void;
  };
  rightIcon?: {
    icon: React.ReactNode;
    onPress: () => void;
  };
  count?: string;
};

export function SectionHeader({
  label,
  title,
  rightAction,
  rightIcon,
  count,
}: SectionHeaderProps) {
  const colors = useColors();
  const styles = React.useMemo(() => StyleSheet.create({
    container: {
      gap: spacing[2],
      paddingHorizontal: spacing[6],
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing[3],
    },
    title: {
      flex: 1,
    },
    iconButton: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }), [colors]);

  return (
    <View style={styles.container}>
      {label && (
        <ThemedText type="labelSm" color={colors.primary.default}>
          {label}
        </ThemedText>
      )}
      <View style={styles.titleRow}>
        <ThemedText type="headlineSm" style={styles.title}>
          {title}
        </ThemedText>
        {count && (
          <ThemedText type="labelSm" color={colors.text.secondary}>
            {count}
          </ThemedText>
        )}
        {rightIcon && (
          <Touchable onPress={rightIcon.onPress} style={styles.iconButton}>
            {rightIcon.icon}
          </Touchable>
        )}
        {rightAction && (
          <Touchable onPress={rightAction.onPress}>
            <ThemedText type="labelSm" color={colors.primary.default}>
              {rightAction.text}
            </ThemedText>
          </Touchable>
        )}
      </View>
    </View>
  );
}
