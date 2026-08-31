import { useFocusEffect } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Plus, Search, Trash2, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { TextInput, useWindowDimensions, View, type ViewStyle } from "react-native";
import { TransitionFlatList } from "@/components/navigation/transition-scroll";
import { DeferredBody } from "@/components/navigation/deferred-body";
import { useScreenSettled } from "@/navigation/use-screen-settled";

import { Touchable } from "@/components/ui/touchable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

import { AddBooksSheet } from "@/components/library/add-books-sheet";
import { BookActionSheet } from "@/components/library/book-action-sheet";
import { BookGridCard } from "@/components/library/book-grid-card";
import { DeleteBookSheet } from "@/components/library/delete-book-sheet";
import { EditTitleSheet } from "@/components/library/edit-title-sheet";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { fontFamily, spacing, MaxContentWidth } from "@/constants/theme";
import type { books as booksTable } from "@/db/schema";
import { asColor } from "@/utils/colors";
import { useAllBooks, useBooksStore } from "@/stores/books";
import { useCollectionsStore } from "@/stores/collections";

type Book = typeof booksTable.$inferSelect;

const COLUMNS = 2;
const ITEM_GAP = spacing[4];
const SIDE_PAD = spacing[6];
// Item width derives from the live window width (useWindowDimensions in the
// component, so it tracks rotation/foldables) and is bounded by what fits two
// columns inside the content column cap — without the bound, capping the grid
// container to `MaxContentWidth` on a wide screen would leave fixed-width
// items overflowing it. On phones the bound never bites (window < 800), so
// the value is unchanged.

// The content column: centred and capped on wide screens, pixel-identical on
// phones (the cap never bites below 800).
const contentColumn: ViewStyle = {
  maxWidth: MaxContentWidth,
  width: "100%",
  alignSelf: "center",
};

// See the section screen — same explicit list render budget so the grid's
// first commit doesn't fight the drawer transition for the JS thread.
const GRID_INITIAL_RENDER = 6;
const GRID_MAX_PER_BATCH = 6;
const GRID_WINDOW_SIZE = 9;
const GRID_BATCH_PERIOD = 50;

const keyExtractor = (item: Book) => item.id;

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  // Half the live width minus one gap and both side pads, bounded by the
  // content column cap (see note above). Memoized to feed `BookGridCard`'s
  // memo a stable value across search keystrokes.
  const itemWidth = useMemo(
    () =>
      Math.min(
        (windowWidth - SIDE_PAD * 2 - ITEM_GAP) / 2,
        (MaxContentWidth - SIDE_PAD * 2 - ITEM_GAP) / 2,
      ),
    [windowWidth],
  );

  const settled = useScreenSettled();

  const [primary, mutedForeground, foreground, surfaceTertiary] =
    useCSSVariable([
      "--color-primary",
      "--color-muted-foreground",
      "--color-foreground",
      "--color-surface-tertiary",
    ]);

  const {
    collections,
    loadCollections,
    deleteCollection,
    addBookToCollection,
    removeBookFromCollection,
    getCollectionBooks,
  } = useCollectionsStore();
  const { updateBookStatus, toggleFavorite, deleteBook, updateBookTitle } = useBooksStore();
  const allBooks = useAllBooks();

  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState("");
  const [actionBook, setActionBook] = useState<Book | null>(null);
  const [deleteConfirmBook, setDeleteConfirmBook] = useState<Book | null>(null);
  const [editTitleBook, setEditTitleBook] = useState<Book | null>(null);
  const [showAddBooks, setShowAddBooks] = useState(false);

  const collection = collections.find((c) => c.id === id);

  const loadCollectionBooks = useCallback(async () => {
    if (!id) return;
    const result = await getCollectionBooks(id);
    setBooks(result);
  }, [id, getCollectionBooks]);

  // Load all books into the store + collection books on focus
  useFocusEffect(
    useCallback(() => {
      useBooksStore
        .getState()
        .loadBooks()
        .then(() => loadCollectionBooks());
      loadCollections();
    }, [loadCollectionBooks, loadCollections]),
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return books;
    const q = query.toLowerCase();
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
    );
  }, [books, query]);

  const openReader = useCallback(
    (bookId: string) => {
      router.push(`/reader/${bookId}` as any);
    },
    [router],
  );

  // Stable, memoized row (Expensify list pattern). `numColumns` handles the
  // ragged last row itself, so the old manual `padded` null-cell array is gone.
  const renderBook = useCallback(
    ({ item }: { item: Book }) => (
      <BookGridCard
        book={item}
        width={itemWidth}
        mutedForeground={asColor(mutedForeground)}
        surfaceTertiary={asColor(surfaceTertiary)}
        onPress={openReader}
        onLongPress={setActionBook}
      />
    ),
    [itemWidth, mutedForeground, surfaceTertiary, openReader],
  );
  const gridExtraData = useMemo(
    () => [mutedForeground, surfaceTertiary],
    [mutedForeground, surfaceTertiary],
  );
  const gridContentStyle = useMemo(
    () => ({ paddingBottom: insets.bottom + spacing[8] }),
    [insets.bottom],
  );

  const handleDeleteCollection = async () => {
    if (!id) return;
    await deleteCollection(id);
    router.back();
  };

  const handleAddBooksConfirm = async (selectedIds: string[]) => {
    if (!id) return;
    const existingIds = new Set(books.map((b) => b.id));

    for (const bookId of selectedIds) {
      if (!existingIds.has(bookId)) {
        await addBookToCollection(bookId, id);
      }
    }
    for (const bookId of [...existingIds]) {
      if (!selectedIds.includes(bookId)) {
        await removeBookFromCollection(bookId, id);
      }
    }

    await loadCollectionBooks();
    await loadCollections();
  };

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View
        className="flex-row items-center gap-3 px-4 py-4"
        style={contentColumn}
      >
        <Touchable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center"
        >
          <ArrowLeft size={22} color={asColor(primary)} />
        </Touchable>
        <ThemedText type="headlineSm" className="flex-1">
          {collection?.name ?? "Collection"}
        </ThemedText>
        <ThemedText type="labelSm" color={asColor(mutedForeground)}>
          {books.length}
        </ThemedText>
        <Touchable
          onPress={() => setShowAddBooks(true)}
          className="h-9 w-9 items-center justify-center"
          hitSlop={8}
        >
          <Plus size={18} color={asColor(foreground)} />
        </Touchable>
        <Touchable
          onPress={handleDeleteCollection}
          className="h-9 w-9 items-center justify-center"
          hitSlop={8}
        >
          <Trash2 size={16} color={asColor(mutedForeground)} />
        </Touchable>
      </View>

      {/* Search — wrapped in the content column because its own `mx-6` margin
          must stay inside the cap (a width + margin on one element would
          overflow the column). */}
      <View style={contentColumn}>
        <View className="mx-6 mb-5 flex-row items-center gap-3 border border-surface-tertiary bg-card px-4 py-3">
          <Search size={16} color={asColor(mutedForeground)} />
          <TextInput
            className="flex-1 p-0 text-[14px] text-foreground"
            style={{ fontFamily: fontFamily.sans }}
            placeholder="Search by title or author…"
            placeholderTextColor={asColor(mutedForeground)}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Touchable onPress={() => setQuery("")}>
              <X size={16} color={asColor(mutedForeground)} />
            </Touchable>
          )}
        </View>
      </View>

      {/* Grid — deferred one frame past the shell so the drawer rise keeps a
          clear JS thread (see `DeferredBody`). */}
      <DeferredBody>
        <TransitionFlatList
          data={filtered}
          extraData={gridExtraData}
          keyExtractor={keyExtractor}
          numColumns={COLUMNS}
          className="flex-1"
          style={contentColumn}
          contentContainerClassName="px-6"
          contentContainerStyle={gridContentStyle}
          columnWrapperClassName="mb-4 gap-4"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={GRID_INITIAL_RENDER}
          maxToRenderPerBatch={GRID_MAX_PER_BATCH}
          windowSize={GRID_WINDOW_SIZE}
          updateCellsBatchingPeriod={GRID_BATCH_PERIOD}
          ListEmptyComponent={
            <View className="w-full items-center pt-16">
              <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                {query ? "No results." : "No books in this collection yet."}
              </ThemedText>
            </View>
          }
          renderItem={renderBook}
        />
      </DeferredBody>

      {settled && (
        <>
          <BookActionSheet
            visible={actionBook !== null}
            book={actionBook}
            onClose={() => setActionBook(null)}
            onOpen={openReader}
            onToggleFavorite={toggleFavorite}
            onSetStatus={updateBookStatus}
            onDelete={(bookId) => {
              const book = allBooks.find((b) => b.id === bookId) ?? null;
              setDeleteConfirmBook(book);
            }}
            onEditTitle={(bookId) => {
              const book = allBooks.find((b) => b.id === bookId) ?? null;
              setEditTitleBook(book);
            }}
          />

          <AddBooksSheet
            visible={showAddBooks}
            allBooks={allBooks}
            existingBookIds={books.map((b) => b.id)}
            onConfirm={handleAddBooksConfirm}
            onClose={() => setShowAddBooks(false)}
          />

          <DeleteBookSheet
            visible={deleteConfirmBook !== null}
            book={deleteConfirmBook}
            onClose={() => setDeleteConfirmBook(null)}
            onConfirm={async (bookId) => {
              await deleteBook(bookId);
              setDeleteConfirmBook(null);
              await loadCollectionBooks();
            }}
          />

          <EditTitleSheet
            visible={editTitleBook !== null}
            book={editTitleBook}
            onClose={() => setEditTitleBook(null)}
            onSave={async (bookId, title) => {
              await updateBookTitle(bookId, title);
              setEditTitleBook(null);
            }}
          />
        </>
      )}
    </ThemedView>
  );
}
