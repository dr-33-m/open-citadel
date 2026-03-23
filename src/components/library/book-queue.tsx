import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { colors, spacing } from '@/constants/theme';
import type { books as booksTable } from '@/db/schema';

type Book = typeof booksTable.$inferSelect;

type BookQueueProps = {
  books: Book[];
  onBookPress?: (bookId: string) => void;
  onBookLongPress?: (book: Book) => void;
};

export function BookQueue({ books, onBookPress, onBookLongPress }: BookQueueProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {books.map((book) => (
        <Pressable
          key={book.id}
          onPress={() => onBookPress?.(book.id)}
          onLongPress={() => onBookLongPress?.(book)}
          style={styles.item}
        >
          <View style={styles.cover}>
            {book.coverUrl ? (
              <Image source={{ uri: book.coverUrl }} style={styles.coverImage} />
            ) : (
              <View style={styles.bookmarkContainer}>
                <View style={styles.bookmark} />
              </View>
            )}
          </View>
          <ThemedText type="bodySm" numberOfLines={1} style={styles.title}>
            {book.title}
          </ThemedText>
          <ThemedText type="labelSm" color={colors.text.secondary} numberOfLines={1}>
            {book.author}
          </ThemedText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing[6],
    gap: spacing[4],
  },
  item: {
    width: 130,
    gap: spacing[2],
  },
  cover: {
    width: 130,
    height: 170,
    backgroundColor: colors.surface.low,
  },
  coverImage: {
    width: 130,
    height: 170,
  },
  bookmarkContainer: {
    flex: 1,
    alignItems: 'flex-end',
    paddingTop: spacing[3],
    paddingRight: spacing[4],
  },
  bookmark: {
    width: 16,
    height: 24,
    backgroundColor: colors.surface.highest,
  },
  title: {
    marginTop: spacing[1],
  },
});
