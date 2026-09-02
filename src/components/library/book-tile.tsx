import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily, motion } from '@/constants/theme';
import type { books as booksTable } from '@/db/schema';
import { COVER_PLACEHOLDER_BLURHASH } from '@/utils/colors';

type Book = typeof booksTable.$inferSelect;

const COVER_FILL = { width: '100%' as const, height: '100%' as const };
/** Constant, so a shelf of tiles is not rebuilding the same object per book. */
const MONOGRAM = { fontSize: 28, fontFamily: fontFamily.serif } as const;
const MONOGRAM_TITLE = { textAlign: 'center' as const, fontSize: 9 };

/**
 * How much of the tile's inner width the cover takes.
 *
 * The cover is deliberately smaller than the panel it sits on: the ground
 * around it is what makes the shadow read as a lift rather than as an edge,
 * and it is what turns a wall of artwork into a row of objects.
 */
const COVER_RATIO = 0.62;
/** `p-4` on the panel, both sides. */
const TILE_PADDING = 16;

type BookTileProps = {
  book: Book;
  /** Full tile width in dp — the column width, or the shelf's item width. */
  width: number;
  /** Resolved `--color-muted-foreground`. */
  mutedForeground: string | undefined;
  /** Resolved `--color-surface-tertiary`, for the no-cover monogram. */
  surfaceTertiary: string | undefined;
  /**
   * A mark over the cover's top-left, for a shelf that flags its books.
   *
   * The icon component and colour, not a ready-made element: an element is a
   * new object on every render of the shelf, which defeats this component's
   * `memo` and re-renders every visible tile whenever the shelf re-renders for
   * any reason at all. A module-level icon reference and a colour string are
   * both stable, so the memo holds.
   */
  badgeIcon?: React.ComponentType<{ size?: number; color?: string }>;
  badgeColor?: string;
  /** A grid wraps to two lines; a shelf usually wants one. */
  titleLines?: number;
  onPress?: (bookId: string) => void;
  onLongPress?: (book: Book) => void;
};

/**
 * One book, everywhere a book is drawn as a tile.
 *
 * The cover sits centred and small on a panel of the app's `muted` ground —
 * the same shade the display-name field uses — with the shadow on the cover
 * itself. The panel is flat; the artwork is the thing that lifts.
 *
 * This exists because there were four copies of it: the two-column grid card
 * and three shelves (favourites, queue, archive) that differed only in which
 * badge they drew over the corner. Four copies of one rule is four chances for
 * it to drift, and it already had.
 *
 * Colour tokens arrive as props rather than through `useCSSVariable` here, so
 * a grid or shelf of these shares one subscription instead of taking one per
 * tile.
 */
function BookTileBase({
  book,
  width,
  mutedForeground,
  surfaceTertiary,
  badgeIcon: BadgeIcon,
  badgeColor,
  titleLines = 2,
  onPress,
  onLongPress,
}: BookTileProps) {
  const coverWidth = Math.round((width - TILE_PADDING * 2) * COVER_RATIO);

  return (
    <Touchable
      style={{ width }}
      onPress={onPress && (() => onPress(book.id))}
      onLongPress={onLongPress && (() => onLongPress(book))}
    >
      <View className="gap-3 bg-muted p-4">
        <View className="items-center">
          {/* The shadow lives on a wrapper because the cover clips its
              contents, and a clipping node clips its own shadow away too. */}
          <View className="shadow-sm" style={{ width: coverWidth }}>
            <View className="aspect-[2/3] overflow-hidden bg-card">
              {book.coverUrl ? (
                <Image
                  source={{ uri: book.coverUrl }}
                  style={COVER_FILL}
                  placeholder={{ blurhash: COVER_PLACEHOLDER_BLURHASH }}
                  transition={motion.slow}
                  recyclingKey={book.id}
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <ThemedText
                    type="headlineSm"
                    color={surfaceTertiary}
                    style={MONOGRAM}
                  >
                    {book.title.charAt(0).toUpperCase()}
                  </ThemedText>
                  <ThemedText
                    type="labelSm"
                    color={mutedForeground}
                    className="absolute bottom-2 px-2"
                    style={MONOGRAM_TITLE}
                    numberOfLines={2}
                  >
                    {book.title}
                  </ThemedText>
                </View>
              )}
              {!book.filePath && <SyncBadge />}
              {BadgeIcon && book.filePath ? (
                <View className="absolute left-2 top-2 rounded-full bg-background">
                  <BadgeIcon size={22} color={badgeColor} />
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View className="gap-1">
          <ThemedText type="headlineSm" numberOfLines={titleLines}>
            {book.title}
          </ThemedText>
          {/* Sentence case, not the uppercase `labelSm` the grid used to use:
              an author is a name, and a name in small caps reads as a label
              about the book rather than as the person who wrote it. */}
          <ThemedText type="bodySm" color={mutedForeground} numberOfLines={1}>
            {book.author}
          </ThemedText>
        </View>
      </View>
    </Touchable>
  );
}

/**
 * `memo`'d so a keystroke in a screen's search field reflows only the tiles
 * whose `book` actually changed, not every visible cover.
 */
export const BookTile = React.memo(BookTileBase);
