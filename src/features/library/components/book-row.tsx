import React from 'react';
import { View } from 'react-native';

import { CoverImage } from '@/components/cover-image';
import { Ellipsis } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily } from '@/constants/theme';
import { useBookProgress } from '@/features/library/hooks/use-book-progress';
import type { Book } from '@/stores/books';

/** The episode and post rows' artwork width; a cover is that wide and half again as tall. */
export const BOOK_ROW_COVER = { width: 56, height: 84 } as const;
const COVER_FILL = { width: '100%' as const, height: '100%' as const };
const MONOGRAM = { fontSize: 22, fontFamily: fontFamily.serif } as const;

type BookRowProps = {
  book: Book;
  mutedForeground: string | undefined;
  surfaceTertiary: string | undefined;
  onPress: (bookId: string) => void;
  onMenu: (book: Book) => void;
};

/**
 * A book in a list, laid out as a post or an episode row is, so a queue of
 * books reads like a queue of either: its cover beside its title in the
 * library's serif and its author, with how far in it is read and the menu at
 * the foot.
 *
 * The author is in sentence case, as on a tile: a name in small caps reads as
 * a label about the book rather than as the person who wrote it.
 */
function BookRowBase({ book, mutedForeground, surfaceTertiary, onPress, onMenu }: BookRowProps) {
  const fraction = useBookProgress(book.id);

  return (
    <Touchable onPress={() => onPress(book.id)} onLongPress={() => onMenu(book)}>
      <View className="flex-row gap-3 px-6 py-5">
        <View className="overflow-hidden bg-card" style={BOOK_ROW_COVER}>
          {book.coverUrl ? (
            <CoverImage source={{ uri: book.coverUrl }} style={COVER_FILL} recyclingKey={book.id} />
          ) : (
            <View className="flex-1 items-center justify-center border border-border">
              <ThemedText type="headlineSm" color={surfaceTertiary} style={MONOGRAM}>
                {book.title.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}
          {book.filePath === null ? <SyncBadge /> : null}
        </View>
        <View className="flex-1 justify-between gap-2">
          <View className="gap-1">
            <ThemedText type="headlineSm" numberOfLines={2}>
              {book.title}
            </ThemedText>
            <ThemedText type="bodySm" color={mutedForeground} numberOfLines={1}>
              {book.author}
            </ThemedText>
          </View>
          <View className="flex-row items-center gap-3">
            {fraction > 0 ? (
              <View className="h-[3px] w-12 bg-muted">
                <View className="h-full bg-primary" style={{ width: `${fraction * 100}%` }} />
              </View>
            ) : null}
            <View className="flex-1" />
            <Touchable
              className="h-10 w-10 items-center justify-center"
              hitSlop={4}
              onPress={() => onMenu(book)}
              accessibilityRole="button"
              accessibilityLabel="More"
            >
              <Ellipsis size={20} color={mutedForeground} />
            </Touchable>
          </View>
        </View>
      </View>
    </Touchable>
  );
}

export const BookRow = React.memo(BookRowBase);
