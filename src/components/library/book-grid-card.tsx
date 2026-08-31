import { Image } from "expo-image";
import React from "react";
import { View } from "react-native";

import { SyncBadge } from "@/components/ui/sync-badge";
import { Touchable } from "@/components/ui/touchable";
import { ThemedText } from "@/components/themed-text";
import { elevation, fontFamily } from "@/constants/theme";
import type { books as booksTable } from "@/db/schema";
import { COVER_PLACEHOLDER_BLURHASH } from "@/utils/colors";

type Book = typeof booksTable.$inferSelect;

const COVER_FILL = { width: "100%" as const, height: "100%" as const };

type BookGridCardProps = {
  book: Book;
  /** Column width in dp, derived once by the screen from the live window. */
  width: number;
  /** Resolved `--color-muted-foreground`, passed down so a grid of these
   *  shares one `useCSSVariable` subscription instead of one per card. */
  mutedForeground: string | undefined;
  /** Resolved `--color-surface-tertiary`. */
  surfaceTertiary: string | undefined;
  onPress: (bookId: string) => void;
  onLongPress: (book: Book) => void;
};

/**
 * One book in a 2‑column library grid (the "View All" section screen and a
 * collection). Split out and `memo`'d — the Expensify app's list rows do the
 * same — so a keystroke in the screen's search field reflows only the rows
 * whose `book` actually changed, not every visible cover. Colour tokens arrive
 * as props from the screen's single `useCSSVariable` call.
 */
function BookGridCardBase({
  book,
  width,
  mutedForeground,
  surfaceTertiary,
  onPress,
  onLongPress,
}: BookGridCardProps) {
  return (
    <Touchable
      className="gap-2"
      style={{ width }}
      onPress={() => onPress(book.id)}
      onLongPress={() => onLongPress(book)}
    >
      {/* The shadow lives on a wrapper because the cover clips its contents,
          and a clipping node clips its own shadow away too. */}
      <View style={elevation.soft}>
        <View className="aspect-[2/3] overflow-hidden bg-card">
          {book.coverUrl ? (
            <Image
              source={{ uri: book.coverUrl }}
              style={COVER_FILL}
              placeholder={{ blurhash: COVER_PLACEHOLDER_BLURHASH }}
              recyclingKey={book.id}
            />
          ) : (
            <View className="flex-1 items-center justify-center bg-muted">
              <ThemedText
                type="headlineSm"
                color={surfaceTertiary}
                style={{ fontSize: 28, fontFamily: fontFamily.serif }}
              >
                {book.title.charAt(0).toUpperCase()}
              </ThemedText>
              <ThemedText
                type="labelSm"
                color={mutedForeground}
                className="absolute bottom-2 px-2"
                style={{ textAlign: "center", fontSize: 9 }}
                numberOfLines={2}
              >
                {book.title}
              </ThemedText>
            </View>
          )}
          {!book.filePath && <SyncBadge />}
        </View>
      </View>
      <ThemedText type="bodySm" numberOfLines={2} style={{ lineHeight: 18 }}>
        {book.title}
      </ThemedText>
      <ThemedText type="labelSm" color={mutedForeground} numberOfLines={1}>
        {book.author}
      </ThemedText>
    </Touchable>
  );
}

export const BookGridCard = React.memo(BookGridCardBase);
