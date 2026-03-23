import { CircleCheckBig } from 'lucide-react-native';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { colors, spacing } from '@/constants/theme';
import type { books as booksTable } from '@/db/schema';

type Book = typeof booksTable.$inferSelect;

type ArchivedCardProps = {
  books: Book[];
  onBookPress?: (bookId: string) => void;
  onBookLongPress?: (book: Book) => void;
};

export function ArchivedCards({ books, onBookPress, onBookLongPress }: ArchivedCardProps) {
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
              <View style={styles.coverPlaceholder} />
            )}
            <View style={styles.checkBadge}>
              <CircleCheckBig size={22} color={colors.primary.default} />
            </View>
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
  coverPlaceholder: {
    flex: 1,
    backgroundColor: colors.surface.mid,
  },
  checkBadge: {
    position: 'absolute',
    top: spacing[2],
    left: spacing[2],
    backgroundColor: colors.surface.base,
    borderRadius: 11,
  },
  title: {
    marginTop: spacing[1],
  },
});
