import React, { useCallback, useMemo } from "react";
import { View, type ViewStyle } from "react-native";

import { BookGridCard } from "@/features/library/components/book-grid-card";
import { TransitionFlashList } from "@/components/navigation/transition-scroll";
import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import type { TileBook } from "@/features/library/utils/tile-book";


/** Two columns of books, the "View All" screens' grid. */
const COLUMNS = 2;
/** Between the two columns, and under every card. */
export const BOOK_GRID_GAP = spacing[4];
/** From the screen's edge to the outer edge of a card. */
export const BOOK_GRID_SIDE_PAD = spacing[6];

/*
 * FlashList gives each column an equal share of the content width and has no
 * column gap, so the gap is split: half of it pads each side of every cell,
 * and the content padding gives back the outer half. The cards land
 * `BOOK_GRID_GAP` apart and `BOOK_GRID_SIDE_PAD` from the edge, at exactly the
 * width `useBookGridItemWidth` gives them.
 */
const CELL: ViewStyle = {
  paddingHorizontal: BOOK_GRID_GAP / 2,
  paddingBottom: BOOK_GRID_GAP,
};

const keyExtractor = (item: TileBook) => String(item.id);

/**
 * The books on a "View All" screen: a section, or a collection.
 *
 * Masonry, so each column packs its own cards. A title runs to one line or
 * two, and in rows a one-line card sat beside a two-line one with a hole under
 * it; here the next card starts right under each, and the shorter column takes
 * the next book (`optimizeItemArrangement`).
 *
 * FlashList rather than FlatList, which has no masonry: it recycles cells
 * instead of mounting a fresh one per book, and only draws what is near the
 * viewport, which a library of a few hundred covers needs.
 */
export function BookMasonryGrid<B extends TileBook>({
  books,
  itemWidth,
  mutedForeground,
  surfaceTertiary,
  bottomInset,
  emptyText,
  style,
  onPress,
  onLongPress,
  onEndReached,
  footer,
}: {
  books: B[];
  itemWidth: number;
  mutedForeground: string | undefined;
  surfaceTertiary: string | undefined;
  /** Space under the last row, so it clears the home indicator. */
  bottomInset: number;
  emptyText: string;
  style?: ViewStyle;
  onPress: (bookId: B['id']) => void;
  onLongPress?: (book: B) => void;
  /** The last row is near: a paged list asks for its next page here. */
  onEndReached?: () => void;
  /** Under the last row: a paged list's "loading more". */
  footer?: React.ReactElement | null;
}) {
  // Stable `renderItem` (Expensify pattern): a search keystroke re-renders the
  // screen, and an inline renderer would treat every visible cell as new.
  // `extraData` re-runs the list when the resolved colours change (a theme
  // flip with the screen already open).
  const renderBook = useCallback(
    ({ item }: { item: B }) => (
      <View style={CELL}>
        <BookGridCard
          book={item}
          width={itemWidth}
          mutedForeground={mutedForeground}
          surfaceTertiary={surfaceTertiary}
          onPress={onPress}
          onLongPress={onLongPress}
        />
      </View>
    ),
    [itemWidth, mutedForeground, surfaceTertiary, onPress, onLongPress],
  );
  const extraData = useMemo(
    () => [mutedForeground, surfaceTertiary],
    [mutedForeground, surfaceTertiary],
  );
  const contentStyle = useMemo(
    () => ({
      paddingHorizontal: BOOK_GRID_SIDE_PAD - BOOK_GRID_GAP / 2,
      paddingBottom: bottomInset + spacing[8],
    }),
    [bottomInset],
  );

  return (
    <PageFade>
      <TransitionFlashList
        data={books}
        extraData={extraData}
        keyExtractor={keyExtractor}
        numColumns={COLUMNS}
        masonry
        optimizeItemArrangement
        style={style}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <View className="w-full items-center pt-16">
            <ThemedText type="bodySm" color={mutedForeground}>
              {emptyText}
            </ThemedText>
          </View>
        }
        renderItem={renderBook}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={footer}
      />
    </PageFade>
  );
}

/**
 * How wide one card is: half the live width less the gap and both side pads,
 * bounded by the content column cap so a wide screen does not overflow it.
 */
export function bookGridItemWidth(windowWidth: number, maxContentWidth: number) {
  const usable = Math.min(windowWidth, maxContentWidth);
  return (usable - BOOK_GRID_SIDE_PAD * 2 - BOOK_GRID_GAP) / COLUMNS;
}
