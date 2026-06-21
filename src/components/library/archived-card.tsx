import { CircleCheckBig, RefreshCw } from 'lucide-react-native';
import React from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { Touchable } from '@/components/ui/touchable';

import { ThemedText } from '@/components/themed-text';
import { useColors } from '@/hooks/use-colors';
import { fontFamily, spacing } from '@/constants/theme';
import type { books as booksTable } from '@/db/schema';

type Book = typeof booksTable.$inferSelect;

type ArchivedCardProps = {
  books: Book[];
  onBookPress?: (bookId: string) => void;
  onBookLongPress?: (book: Book) => void;
};

export function ArchivedCards({ books, onBookPress, onBookLongPress }: ArchivedCardProps) {
  const colors = useColors();
  const styles = React.useMemo(() => StyleSheet.create({
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
      alignItems: 'center',
      justifyContent: 'center',
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
    checkBadge: {
      position: 'absolute',
      top: spacing[2],
      left: spacing[2],
      backgroundColor: colors.surface.base,
      borderRadius: 11,
    },
    syncBadge: {
      position: 'absolute',
      top: spacing[2],
      left: spacing[2],
      backgroundColor: colors.surface.base,
      borderRadius: 11,
      padding: 3,
    },
    title: {
      marginTop: spacing[1],
    },
  }), [colors]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {books.map((book) => (
        <Touchable
          key={book.id}
          onPress={() => onBookPress?.(book.id)}
          onLongPress={() => onBookLongPress?.(book)}
          style={styles.item}
        >
          <View style={styles.cover}>
            {book.coverUrl ? (
              <Image source={{ uri: book.coverUrl }} style={styles.coverImage} />
            ) : (
              <View style={styles.coverPlaceholder}>
                <ThemedText type="displayLg" color={colors.surface.highest} style={styles.initial}>
                  {book.title.charAt(0).toUpperCase()}
                </ThemedText>
                <ThemedText type="labelSm" color={colors.text.secondary} style={styles.coverTitle} numberOfLines={2}>
                  {book.title}
                </ThemedText>
              </View>
            )}
            {!book.filePath ? (
              <View style={styles.syncBadge}>
                <RefreshCw size={14} color={colors.text.secondary} />
              </View>
            ) : (
              <View style={styles.checkBadge}>
                <CircleCheckBig size={22} color={colors.primary.default} />
              </View>
            )}
          </View>
          <ThemedText type="bodySm" numberOfLines={1} style={styles.title}>
            {book.title}
          </ThemedText>
          <ThemedText type="labelSm" color={colors.text.secondary} numberOfLines={1}>
            {book.author}
          </ThemedText>
        </Touchable>
      ))}
    </ScrollView>
  );
}
