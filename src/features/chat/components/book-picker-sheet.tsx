import React, { useCallback, useEffect, useRef } from 'react';
import { useCSSVariable } from 'uniwind';

import { AttachmentPickerSheet } from '@/components/attachment-picker-sheet';
import { CoverImage } from '@/components/cover-image';
import { ChevronRight } from '@/components/icons';
import { BookListSkeleton } from '@/components/skeletons/book-list-skeleton';
import { ThemedText } from '@/components/themed-text';
import { Item } from '@/components/ui/item';
import { fontFamily } from '@/constants/theme';
import { asColor } from '@/utils/colors';
import { useAllBooks, useBooksStore } from '@/stores/books';

/**
 * Row geometry. A picker is a scanning task, so every row is the same height
 * and the cover is small: titles here run from three words to a full
 * subtitle-laden Victorian mouthful, and letting them set the row height turns
 * the list into a ragged wall you can't skim. The title gets two lines and
 * then truncates — enough to tell two books apart, never enough to dominate.
 */
const COVER_WIDTH = 40;
const COVER_HEIGHT = 56;
const COVER_FILL = { width: COVER_WIDTH, height: COVER_HEIGHT };

type PickerBook = ReturnType<typeof useAllBooks>[number];

/**
 * One row, memoized: re-filtering on a keystroke changes the data array,
 * but the rows whose book did not change skip re-rendering entirely.
 */
const BookRow = React.memo(function BookRow({
  book,
  surfaceTertiary,
  mutedForeground,
  onSelect,
}: {
  book: PickerBook;
  surfaceTertiary?: string;
  mutedForeground?: string;
  onSelect(bookId: string, bookTitle: string): void;
}) {
  return (
    <Item className="px-6 py-3" onPress={() => onSelect(book.id, book.title)}>
      <Item.Media variant="image" className="h-[56px] w-[40px]">
        {book.coverUrl ? (
          <CoverImage
            source={{ uri: book.coverUrl }}
            style={COVER_FILL}
            recyclingKey={book.id}
          />
        ) : (
          <ThemedText
            color={surfaceTertiary}
            style={{ fontFamily: fontFamily.serif, fontSize: 18 }}
          >
            {book.title.charAt(0).toUpperCase()}
          </ThemedText>
        )}
      </Item.Media>
      <Item.Content>
        <Item.Title numberOfLines={2} style={{ fontSize: 15, lineHeight: 20 }}>
          {book.title}
        </Item.Title>
        <Item.Description numberOfLines={1} style={{ fontSize: 12, lineHeight: 16 }}>
          {book.author}
        </Item.Description>
      </Item.Content>
      <Item.Actions>
        <ChevronRight size={16} color={mutedForeground} />
      </Item.Actions>
    </Item>
  );
});

const matchesBook = (book: PickerBook, query: string) => {
  const q = query.toLowerCase();
  return book.title.toLowerCase().includes(q) || book.author.toLowerCase().includes(q);
};
const keyOf = (book: PickerBook) => book.id;

/**
 * The book picker: a search over the library, one tap to attach a book to
 * the chat. Its rows on the shared `AttachmentPickerSheet`, as the post and
 * episode pickers are.
 */
export function BookPickerSheet({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect(bookId: string, bookTitle: string): void;
  onClose(): void;
}) {
  const [surfaceTertiary, mutedForeground] = useCSSVariable([
    '--color-surface-tertiary',
    '--color-muted-foreground',
  ]);
  const allBooks = useAllBooks();
  const loadBooks = useBooksStore((s) => s.loadBooks);

  useEffect(() => {
    if (visible) loadBooks();
  }, [visible, loadBooks]);

  /*
   * `onSelect` arrives as an inline arrow from the call site, so it cannot
   * key the memoized rows directly. It rides in through a ref instead: taps
   * land after commit, so the effect-synced ref never misses.
   */
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const handleSelect = useCallback((bookId: string, bookTitle: string) => {
    onSelectRef.current(bookId, bookTitle);
  }, []);

  const tertiary = asColor(surfaceTertiary);
  const muted = asColor(mutedForeground);
  const renderItem = useCallback(
    ({ item }: { item: PickerBook }) => (
      <BookRow book={item} surfaceTertiary={tertiary} mutedForeground={muted} onSelect={handleSelect} />
    ),
    [handleSelect, muted, tertiary],
  );

  return (
    <AttachmentPickerSheet
      visible={visible}
      onClose={onClose}
      title="Pick a book"
      placeholder="Search books…"
      items={allBooks}
      matches={matchesBook}
      keyOf={keyOf}
      renderItem={renderItem}
      skeleton={<BookListSkeleton />}
      emptyText="No books yet. Add one in the Library."
      noMatchText="No books found"
    />
  );
}
