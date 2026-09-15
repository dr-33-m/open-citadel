import React from "react";

import { BookTile } from "@/components/library/book-tile";
import type { books as booksTable } from "@/db/schema";

type Book = typeof booksTable.$inferSelect;

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
 * One book in a 2-column library grid (the "View All" section screen and a
 * collection).
 *
 * A thin name over `BookTile`, which is the one place that decides what a book
 * looks like. Kept as its own export because the grid screens and the skeleton
 * that stands in for them are written in terms of it.
 */
export function BookGridCard(props: BookGridCardProps) {
  return <BookTile {...props} titleLines={2} />;
}
