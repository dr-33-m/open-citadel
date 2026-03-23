import React, { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { ProgressBar } from '@/components/ui/progress-bar';
import { colors, fontFamily, spacing } from '@/constants/theme';
import type { books } from '@/db/schema';
import { db } from '@/db/client';
import { readingProgress } from '@/db/schema';
import { eq } from 'drizzle-orm';

type Book = typeof books.$inferSelect;

type CurrentlyReadingCardProps = {
  book: Book;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function CurrentlyReadingCard({ book, onPress, onLongPress }: CurrentlyReadingCardProps) {
  const [progress, setProgress] = useState(0);

  useFocusEffect(
    useCallback(() => {
      db.select()
        .from(readingProgress)
        .where(eq(readingProgress.bookId, book.id))
        .then(([row]) => {
          if (row) setProgress(row.percentage);
        });
    }, [book.id])
  );

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      <View style={styles.card}>
        {book.coverUrl ? (
          <Image source={{ uri: book.coverUrl }} style={styles.cover} />
        ) : (
          <View style={styles.cover}>
            <ThemedText type="displayLg" color={colors.surface.highest} style={styles.initial}>
              {book.title.charAt(0).toUpperCase()}
            </ThemedText>
            <ThemedText
              type="labelSm"
              color={colors.text.secondary}
              style={styles.coverTitle}
              numberOfLines={2}
            >
              {book.title}
            </ThemedText>
          </View>
        )}

        <View style={styles.info}>
          {book.category && (
            <ThemedText type="labelSm" color={colors.primary.default}>
              {book.category}
            </ThemedText>
          )}
          <ThemedText type="headlineMd" numberOfLines={2}>{book.title}</ThemedText>
          <ThemedText type="bodySm" color={colors.text.secondary}>
            {book.author}
          </ThemedText>

          <View style={styles.progressSection}>
            <View style={styles.progressLabels}>
              <ThemedText type="labelSm" color={colors.text.secondary}>
                PROGRESS
              </ThemedText>
              <ThemedText type="labelSm" color={colors.primary.default}>
                {Math.round(progress * 100)}%
              </ThemedText>
            </View>
            <ProgressBar progress={progress} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface.low,
    padding: spacing[5],
    gap: spacing[5],
  },
  cover: {
    width: 90,
    height: 130,
    backgroundColor: colors.surface.mid,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    fontSize: 36,
    fontFamily: fontFamily.serif,
  },
  coverTitle: {
    position: 'absolute',
    bottom: spacing[2],
    paddingHorizontal: spacing[2],
    textAlign: 'center',
    fontSize: 9,
  },
  info: {
    flex: 1,
    gap: spacing[2],
    justifyContent: 'center',
  },
  progressSection: {
    marginTop: spacing[3],
    gap: spacing[2],
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
