import { Bookmark, BookmarkCheck, List } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';

type ReaderHeaderProps = {
  title: string;
  progress?: number;
  isBookmarked?: boolean;
  onBack: () => void;
  onBookmarkToggle?: () => void;
  onContents?: () => void;
};

export function ReaderHeader({
  title,
  progress,
  isBookmarked,
  onBack,
  onBookmarkToggle,
  onContents,
}: ReaderHeaderProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const styles = React.useMemo(() => StyleSheet.create({
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
  }), [colors]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing[2] }]}>
      <Pressable onPress={onBack} style={styles.iconButton}>
        <ThemedText type="bodyMd" color={colors.primary.default}>
          ←
        </ThemedText>
      </Pressable>

      <ThemedText
        type="bodySm"
        color={colors.text.secondary}
        numberOfLines={1}
        style={styles.title}
      >
        {title}
      </ThemedText>

      <View style={styles.right}>
        <Pressable onPress={onBookmarkToggle} style={styles.iconButton}>
          {isBookmarked ? (
            <BookmarkCheck size={20} color={colors.primary.default} />
          ) : (
            <Bookmark size={20} color={colors.text.primary} />
          )}
        </Pressable>
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
