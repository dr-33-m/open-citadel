import { CircleStar } from 'lucide-react-native';
import { Image } from 'expo-image';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { RowFade } from '@/components/scroll-fades';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Touchable } from '@/components/ui/touchable';

import { ThemedText } from '@/components/themed-text';
import { fontFamily, motion } from '@/constants/theme';
import type { books as booksTable } from '@/db/schema';
import { COVER_PLACEHOLDER_BLURHASH } from '@/utils/colors';

type Book = typeof booksTable.$inferSelect;

type FavoritesProps = {
  books: Book[];
  onBookPress?: (bookId: string) => void;
  onBookLongPress?: (book: Book) => void;
};

/** ThemedText/lucide icons take a literal color, not a className. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const COVER_FILL = { width: '100%' as const, height: '100%' as const };

export function Favorites({ books, onBookPress, onBookLongPress }: FavoritesProps) {
  const [ghostInk, mutedForeground, primary] = useCSSVariable([
    '--color-surface-tertiary',
    '--color-muted-foreground',
    '--color-primary',
  ]);

  // The fade is the affordance: it says there is more past the edge, and it
  // shows only when there actually is.
  return (
    <RowFade>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-4 px-6"
      >
        {books.map((book) => (
          <Touchable
            key={book.id}
            onPress={() => onBookPress?.(book.id)}
            onLongPress={() => onBookLongPress?.(book)}
            className="w-[130px] gap-2"
          >
            <View className="aspect-[2/3] w-[130px] bg-muted">
              {book.coverUrl ? (
                <Image
                  source={{ uri: book.coverUrl }}
                  style={COVER_FILL}
                  placeholder={{ blurhash: COVER_PLACEHOLDER_BLURHASH }}
                  transition={motion.slow}
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <ThemedText
                    type="displayLg"
                    color={asColor(ghostInk)}
                    style={{ fontSize: 36, fontFamily: fontFamily.serif }}
                  >
                    {book.title.charAt(0).toUpperCase()}
                  </ThemedText>
                  <ThemedText
                    type="labelSm"
                    color={asColor(mutedForeground)}
                    className="absolute bottom-2 px-2"
                    style={{ textAlign: 'center', fontSize: 9 }}
                    numberOfLines={2}
                  >
                    {book.title}
                  </ThemedText>
                </View>
              )}
              {!book.filePath ? (
                <SyncBadge />
              ) : (
                <View className="absolute left-2 top-2 rounded-full bg-background">
                  <CircleStar size={22} color={asColor(primary)} />
                </View>
              )}
            </View>
            <ThemedText type="bodySm" numberOfLines={1} className="mt-1">
              {book.title}
            </ThemedText>
            <ThemedText type="labelSm" color={asColor(mutedForeground)} numberOfLines={1}>
              {book.author}
            </ThemedText>
          </Touchable>
        ))}
      </ScrollView>
    </RowFade>
  );
}
