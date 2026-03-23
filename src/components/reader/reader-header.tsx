import { List } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { colors, spacing } from '@/constants/theme';

type ReaderHeaderProps = {
  title: string;
  progress?: number;
  onBack: () => void;
  onContents?: () => void;
};

export function ReaderHeader({
  title,
  progress,
  onBack,
  onContents,
}: ReaderHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing[2] }]}>
      {/* Left: back only */}
      <Pressable onPress={onBack} style={styles.iconButton}>
        <ThemedText type="bodyMd" color={colors.primary.default}>
          ←
        </ThemedText>
      </Pressable>

      {/* Center: title */}
      <ThemedText
        type="bodySm"
        color={colors.text.secondary}
        numberOfLines={1}
        style={styles.title}
      >
        {title}
      </ThemedText>

      {/* Right: contents + progress */}
      <View style={styles.right}>
        <Pressable onPress={onContents} style={styles.iconButton}>
          <List size={20} color={colors.text.primary} />
        </Pressable>
        {progress !== undefined && (
          <ThemedText type="labelSm" color={colors.text.secondary}>
            {Math.round(progress * 100)}%
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    backgroundColor: colors.surface.base,
    gap: spacing[2],
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
