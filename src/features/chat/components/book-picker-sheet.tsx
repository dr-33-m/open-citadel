import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { ChevronRight } from 'lucide-react-native';
import { Image } from 'expo-image';

import { PageFade } from '@/components/scroll-fades';
import { Item } from '@/components/ui/item';
import { SearchBar } from '@/components/ui/search-bar';
import { BookListSkeleton } from '@/components/skeletons/book-list-skeleton';
import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { fontFamily, motion } from '@/constants/theme';
import { asColor, COVER_PLACEHOLDER_BLURHASH } from '@/utils/colors';
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

const FILL: { flex: 1 } = { flex: 1 };

type PickerBook = ReturnType<typeof useAllBooks>[number];

/** Hairline between rows — `Item.Separator` in the list's separator slot. */
function RowSeparator() {
  return <Item.Separator />;
}

type BookListProps = {
  books: PickerBook[];
  surfaceTertiary?: string;
  mutedForeground?: string;
  onSelect(bookId: string, bookTitle: string): void;
};

/**
 * The list, memoized behind the query. A keystroke re-renders the sheet —
 * and only the sheet: with the rows behind `React.memo` and the filtered
 * array a `useMemo` of the *deferred* query, an urgent keystroke render
 * finds the list's props unchanged and stops at the header and the field.
 * The expensive part (re-filtering, re-rendering every row) waits for the
 * deferred render, where it cannot delay the next keystroke's commit.
 * Together with the uncontrolled search field this is what keeps typing
 * from dropping or duplicating letters: the field's text lives in the
 * native buffer, and the JS thread is free again within a frame.
 */
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
          <Image
            source={{ uri: book.coverUrl }}
            style={COVER_FILL}
            placeholder={{ blurhash: COVER_PLACEHOLDER_BLURHASH }}
            recyclingKey={book.id}
            transition={motion.slow}
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

const BookList = React.memo(function BookList({
  books,
  surfaceTertiary,
  mutedForeground,
  onSelect,
}: BookListProps) {
  const renderItem = useCallback(
    ({ item }: { item: PickerBook }) => (
      <BookRow
        book={item}
        surfaceTertiary={surfaceTertiary}
        mutedForeground={mutedForeground}
        onSelect={onSelect}
      />
    ),
    [surfaceTertiary, mutedForeground, onSelect],
  );

  return (
    <PageFade edges="both" surface="popover">
      <Sheet.FlatList
        style={FILL}
        data={books}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={RowSeparator}
        // A row tapped while the search keyboard is still up must select
        // the book, not just dismiss the keyboard and lose the tap.
        keyboardShouldPersistTaps="handled"
        renderItem={renderItem}
      />
    </PageFade>
  );
});

/**
 * The book picker: a search over the library, one tap to attach a book to
 * the chat.
 *
 * Fixed height rather than sized to content, because the list is the whole
 * sheet: a picker that is two rows tall when the library is short and full
 * screen when it is long moves the search field somewhere different every
 * time it opens. The list is `Sheet.FlatList`, so a drag on the rows scrolls
 * and a drag at the top of the list hands back to the sheet.
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
  const [query, setQuery] = useState('');
  // The field itself is uncontrolled (see the SearchBar note below); the
  // list filters against the deferred query so a burst of keystrokes
  // doesn't synchronously re-filter/re-render the whole list on every
  // letter.
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (visible) loadBooks();
  }, [visible, loadBooks]);

  const filtered = useMemo(
    () =>
      deferredQuery.trim()
        ? allBooks.filter(
            (b) =>
              b.title.toLowerCase().includes(deferredQuery.toLowerCase()) ||
              b.author.toLowerCase().includes(deferredQuery.toLowerCase()),
          )
        : allBooks,
    [allBooks, deferredQuery],
  );

  /*
   * The field is uncontrolled (no `value` round-trip — see the SearchBar
   * note below), so resetting the query state alone would leave the stale
   * text sitting in the native buffer. The epoch remounts the bar on the
   * next open — `handleClose` is the one place every dismissal passes
   * through (a pick, a drag, the backdrop, the parent) — and a fresh mount
   * starts with an empty buffer and an empty mirror.
   */
  const [fieldEpoch, setFieldEpoch] = useState(0);

  /*
   * `onSelect` arrives as an inline arrow from the call site, so it cannot
   * key the memoized list directly. It rides in through a ref instead —
   * taps land after commit, so the effect-synced ref never misses.
   */
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const handleSelect = useCallback((bookId: string, bookTitle: string) => {
    onSelectRef.current(bookId, bookTitle);
  }, []);

  // Nothing typed survives the sheet closing — the next open is a new
  // search. The shell reports every dismissal here, whatever caused it (a
  // pick, a drag, the backdrop, the parent), so this is the one place that
  // has to reset.
  const handleClose = () => {
    setFieldEpoch((epoch) => epoch + 1);
    setQuery('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={handleClose} fixedHeightRatio={0.7}>
      <View className="flex-row items-center justify-between px-6 pb-3">
        <ThemedText type="headlineSm">Pick a book</ThemedText>
      </View>

      {/* Wrapped rather than `containerClassName`: SearchBar only honours
          that prop when its Cancel button is off, and even then it lands on
          the Input's inner container, which is not the element that needs
          the margin — this wrapper cannot miss. No `avoidKeyboard`: inside a
          sheet the sheet itself lifts off the keyboard, and a field that also
          lifts travels twice. Deliberately uncontrolled: the text lives in
          the native buffer and `onChangeText` mirrors it out, so a keystroke
          that lands while the JS thread is busy can never be committed over
          by a stale `value` — the drop/duplicate bug that made typing here
          a fight. */}
      <View className="mx-6 mb-3">
        <SearchBar
          key={fieldEpoch}
          variant="filled"
          placeholder="Search books…"
          onChangeText={setQuery}
        />
      </View>

      {/* The title and search field above are cheap and render with the sheet;
          only the list waits a frame. Rows carry a cover image each, so on a
          slow device mounting them is what used to hold the sheet at the
          bottom of the screen. */}
      <Sheet.Deferred
        skeleton={<BookListSkeleton />}
      >
        {filtered.length === 0 ? (
          <View className="flex-1 items-center p-4">
            <ThemedText type="bodySm" color={asColor(mutedForeground)}>
              No books found
            </ThemedText>
          </View>
        ) : (
          <BookList
            books={filtered}
            surfaceTertiary={asColor(surfaceTertiary)}
            mutedForeground={asColor(mutedForeground)}
            onSelect={handleSelect}
          />
        )}
      </Sheet.Deferred>
    </Sheet>
  );
}
