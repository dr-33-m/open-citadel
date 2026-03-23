import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { colors, spacing } from '@/constants/theme';

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
          <Pressable onPress={rightIcon.onPress} style={styles.iconButton}>
            {rightIcon.icon}
          </Pressable>
        )}
        {rightAction && (
          <Pressable onPress={rightAction.onPress}>
            <ThemedText type="labelSm" color={colors.primary.default}>
              {rightAction.text}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
