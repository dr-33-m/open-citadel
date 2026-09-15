import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, Plus, RefreshCw, Search, SquareLibrary, Trash2, X } from "@/components/icons";
import React, { useCallback, useMemo, useState } from "react";
import { TextInput, useWindowDimensions, View, type ViewStyle } from "react-native";
import {
  TransitionFlatList,
} from "@/components/navigation/transition-scroll";
import { PageFade } from "@/components/scroll-fades";
import { Handover } from "@/components/navigation/handover";
import { BookGridSkeleton } from "@/components/skeletons/book-grid-skeleton";
import { CollectionGridSkeleton } from "@/components/skeletons/collection-grid-skeleton";
import { useScreenSettled } from "@/navigation/use-screen-settled";

import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/icon-button";
import { Touchable } from "@/components/ui/touchable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

import { BookActionSheet } from "@/components/library/book-action-sheet";
import { BookGridCard } from "@/components/library/book-grid-card";
import { CollectionPickerSheet } from "@/components/library/collection-picker-sheet";
import { DeleteBookSheet } from "@/components/library/delete-book-sheet";
import { EditTitleSheet } from "@/components/library/edit-title-sheet";
import { NewCollectionPrompt } from "@/components/library/new-collection-prompt";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { fontFamily, spacing, MaxContentWidth } from "@/constants/theme";
import type { books as booksTable } from "@/db/schema";
import { asColor } from "@/utils/colors";
import {
  useAllBooks,
  useArchivedBooks,
  useBooksStore,
  useCurrentlyReading,
  useFavoriteBooks,
  useQueuedBooks,
  useSyncRunning,
} from "@/stores/books";
import { useCollectionsStore, type CollectionWithCount } from "@/stores/collections";

type Book = typeof booksTable.$inferSelect;

const SECTION_LABELS: Record<string, string> = {
  reading: "Currently Reading",
  all: "All Books",
  queue: "Queue",
  favorites: "Favorites",
  archived: "Have Read",
  collections: "Collections",
};

const NUM_COLUMNS = 2;

const ITEM_GAP = spacing[4];
const SIDE_PAD = spacing[6];
// Item widths derive from the live window width (useWindowDimensions in the
// component, so they track rotation/foldables) and are bounded by what fits
// two columns inside the content column cap — without the bound, capping the
// grid containers to `MaxContentWidth` on a wide screen would leave
// fixed-width items overflowing them. On phones the bound never bites
// (window < 800), so the values are unchanged.

// Collection grid constants — two columns with a gap

// The content column: centred and capped on wide screens, pixel-identical on
// phones (the cap never bites below 800).
const contentColumn: ViewStyle = {
  maxWidth: MaxContentWidth,
  width: "100%",
  alignSelf: "center",
};

// FlatList render budget, kept explicit rather than on RN's defaults (the
// Expensify app configures its lists the same way): the first commit lands
// while the drawer is still rising, so it should paint only what's visible,
// and scroll batches stay small on low-end Android.
const GRID_INITIAL_RENDER = 6;
const GRID_MAX_PER_BATCH = 6;
const GRID_WINDOW_SIZE = 9;
const GRID_BATCH_PERIOD = 50;

const keyExtractor = (item: Book) => item.id;

const collectionKeyExtractor = (item: CollectionWithCount) => item.id;

/**
 * One collection cell, memoized: a search keystroke re-renders this screen,
 * and cells whose `name`/`count` did not change skip reflowing. Receives
 * primitives and stable callbacks only (see `renderCollection`).
 */
const CollectionCell = React.memo(function CollectionCell({
  id,
  name,
  count,
  primary,
  onPress,
}: {
  id: string;
  name: string;
  count: number;
  primary?: string;
  onPress: (id: string) => void;
}) {
  return (
    <Touchable className="flex-1" onPress={() => onPress(id)}>
      {/* `flex-1` on the CARD, not only on the Touchable around it. The row
          stretches both Touchables to the taller of the two, but the card
          inside sizes to its own content unless it is told to fill — so a
          one-line name sat in a short card beside a two-line one. The same
          fix the Samwell mode cards in Settings needed. */}
      <Card className="flex-1 gap-2 p-5">
        <SquareLibrary size={22} color={asColor(primary)} />
        {/* The name reserves both its lines whether or not it needs them, so
            cards match across ROWS too and not just within one. `numberOfLines`
            caps a long name; it does not hold space for a short one. */}
        <ThemedText type="bodyMd" numberOfLines={2} className="flex-1">
          {name}
        </ThemedText>
        <ThemedText type="labelSm" color={asColor(primary)}>
          {count} {count === 1 ? "BOOK" : "BOOKS"}
        </ThemedText>
      </Card>
    </Touchable>
  );
});

export default function SectionScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  // Books grid: half the live width minus one gap and both side pads, bounded
  // by the content column cap (see note above). Memoized so it keeps a stable
  // identity across search keystrokes and feeds `BookGridCard`'s memo cleanly.
  const itemWidth = useMemo(
    () =>
      Math.min(
        (windowWidth - SIDE_PAD * 2 - ITEM_GAP) / 2,
        (MaxContentWidth - SIDE_PAD * 2 - ITEM_GAP) / 2,
      ),
    [windowWidth],
  );
  // Collections grid: same shape as the books grid — cells flex to the
  // column the FlatList hands them (`columnWrapper` gap halves the row), so
  // no explicit width is needed and rotation/foldables track for free.

  // Heavy work (the grid, the sheets) waits for the drawer to land — see
  // `useScreenSettled` and `settings.tsx`, which does the same.
  const settled = useScreenSettled();

  const [primary, mutedForeground, foreground, surfaceTertiary] =
    useCSSVariable([
      "--color-primary",
      "--color-muted-foreground",
      "--color-foreground",
      "--color-surface-tertiary",
    ]);
  const [query, setQuery] = useState("");
  const [actionBook, setActionBook] = useState<Book | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [collectionPickerBook, setCollectionPickerBook] = useState<string | null>(null);
  const [bookCollectionIds, setBookCollectionIds] = useState<string[]>([]);
  const [deleteConfirmBook, setDeleteConfirmBook] = useState<Book | null>(null);
  const [editTitleBook, setEditTitleBook] = useState<Book | null>(null);
  const syncBooks = useBooksStore((s) => s.syncBooks);
  const clearQueue = useBooksStore((s) => s.clearQueue);
  const updateBookStatus = useBooksStore((s) => s.updateBookStatus);
  const toggleFavorite = useBooksStore((s) => s.toggleFavorite);
  const deleteBook = useBooksStore((s) => s.deleteBook);
  const updateBookTitle = useBooksStore((s) => s.updateBookTitle);
  // The boolean, not the whole scan: this screen only tints one icon with it,
  // and the counters behind it change several times a second — which re-ran
  // this grid of book cards at that rate for a colour that never moved.
  const syncRunning = useSyncRunning();

  const readingBooks = useCurrentlyReading();
  const allBooks = useAllBooks();
  const queuedBooks = useQueuedBooks();
  const favoriteBooks = useFavoriteBooks();
  const archivedBooks = useArchivedBooks();

  const collections = useCollectionsStore((s) => s.collections);
  const loadCollections = useCollectionsStore((s) => s.loadCollections);
  const createCollection = useCollectionsStore((s) => s.createCollection);

  const sectionBooks = useMemo((): Book[] => {
    switch (type) {
      case "reading":
        return readingBooks;
      case "all":
        return allBooks;
      case "queue":
        return queuedBooks;
      case "favorites":
        return favoriteBooks;
      case "archived":
        return archivedBooks;
      default:
        return [];
    }
  }, [type, readingBooks, allBooks, queuedBooks, favoriteBooks, archivedBooks]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sectionBooks;
    const q = query.toLowerCase();
    return sectionBooks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
    );
  }, [sectionBooks, query]);

  const filteredCollections = useMemo(() => {
    if (!query.trim()) return collections;
    const q = query.toLowerCase();
    return collections.filter((c) => c.name.toLowerCase().includes(q));
  }, [collections, query]);

  const title = SECTION_LABELS[type ?? ""] ?? "Books";

  const openReader = useCallback(
    (bookId: string) => {
      const book = allBooks.find((b) => b.id === bookId);
      if (!book?.filePath) return;
      router.push(`/reader/${bookId}` as any);
    },
    [allBooks, router],
  );

  // Stable `renderItem` (Expensify pattern): a search keystroke re-renders this
  // screen, and an inline renderer would make the list treat every visible row
  // as new. `BookGridCard` is `memo`'d, so only rows whose `book` changed
  // reflow. `gridExtraData` re-runs the list when the resolved colours change
  // (a theme flip with the screen already open).
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

  const openCollection = useCallback(
    (collectionId: string) => {
      router.push(`/collection/${collectionId}` as any);
    },
    [router],
  );

  // Same stable-renderItem shape as `renderBook` above: cells are memo'd and
  // receive stable props, so a keystroke only reflows cells that changed.
  const renderCollection = useCallback(
    ({ item }: { item: CollectionWithCount }) => (
      <CollectionCell
        id={item.id}
        name={item.name}
        count={item.count}
        primary={asColor(primary)}
        onPress={openCollection}
      />
    ),
    [primary, openCollection],
  );

  // ── Collections section ──────────────────────────────────────────────────
  if (type === "collections") {
    return (
      <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
        {/* Header */}
        <View
          className="flex-row items-center gap-3 px-4 py-4"
          style={contentColumn}
        >
        <IconButton onPress={() => router.back()} label="Close">
            {/* Down, not back: this screen arrives on the `drawer` transition,
                the same one Settings uses, so it leaves by going down. */}
            <ChevronDown size={20} color={asColor(foreground)} strokeWidth={2} />
          </IconButton>
          {/* The count belongs to the title, not to the buttons. Loose in the
              row it read as a control that had lost its box, now that the
              controls beside it are cards. */}
          <View className="flex-1">
            <ThemedText type="headlineSm" numberOfLines={1}>
              {title}
            </ThemedText>
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              {`${collections.length} ${collections.length === 1 ? 'COLLECTION' : 'COLLECTIONS'}`}
            </ThemedText>
          </View>
          <IconButton onPress={() => setShowNewCollection(true)} label="New collection">
            <Plus size={18} color={asColor(foreground)} strokeWidth={2} />
          </IconButton>
        </View>

        {/* Search — wrapped in the content column because its own `mx-6`
            margin must stay inside the cap (a width + margin on one element
            would overflow the column). */}
        <View style={contentColumn}>
          <View className="mx-6 mb-5 flex-row items-center gap-3 border border-surface-tertiary bg-card px-4 py-3">
            <Search size={16} color={asColor(mutedForeground)} />
            <TextInput
              className="flex-1 p-0 text-[14px] text-foreground"
              style={{ fontFamily: fontFamily.sans }}
              placeholder="Search collections…"
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

        {/* Grid — virtualized like the books grid below (it used to map every
            collection into a ScrollView, paying full mount cost up front);
            the transition-scroll FlatList keeps the screen's own transitions. */}
        <Handover
          ready={settled}
          skeleton={
            <View className="px-6" style={contentColumn}>
              <CollectionGridSkeleton columns={NUM_COLUMNS} />
            </View>
          }
        >
          <PageFade>
            <TransitionFlatList
              data={filteredCollections}
              extraData={gridExtraData}
              keyExtractor={collectionKeyExtractor}
              numColumns={NUM_COLUMNS}
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
                    {query ? "No results." : "No collections yet."}
                  </ThemedText>
                </View>
              }
              renderItem={renderCollection}
            />
          </PageFade>
        </Handover>

        {settled && (
          <NewCollectionPrompt
            visible={showNewCollection}
            onClose={() => setShowNewCollection(false)}
            onCreate={async (name) => {
              await createCollection(name);
              await loadCollections();
              setShowNewCollection(false);
            }}
          />
        )}
      </ThemedView>
    );
  }

  // ── Books sections ───────────────────────────────────────────────────────
  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View
        className="flex-row items-center gap-3 px-4 py-4"
        style={contentColumn}
      >
        <IconButton onPress={() => router.back()} label="Close">
          {/* Down, not back. This screen arrives on the `drawer` transition —
              the same one Settings uses — so it leaves by going down, and the
              control should point where the screen actually goes. */}
          <ChevronDown size={20} color={asColor(foreground)} strokeWidth={2} />
        </IconButton>
        <View className="flex-1">
          <ThemedText type="headlineSm" numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText type="labelSm" color={asColor(mutedForeground)}>
            {`${sectionBooks.length} ${sectionBooks.length === 1 ? 'BOOK' : 'BOOKS'}`}
          </ThemedText>
        </View>
        {type === "all" && (
          <IconButton onPress={syncBooks} label="Rescan the library">
            {/* Gold only while it is actually running, which is a state and
                not decoration. */}
            <RefreshCw
              size={16}
              strokeWidth={2}
              color={
                syncRunning
                  ? asColor(primary)
                  : asColor(mutedForeground)
              }
            />
          </IconButton>
        )}
        {type === "queue" && (
          <IconButton onPress={clearQueue} label="Clear the queue">
            <Trash2 size={16} color={asColor(mutedForeground)} strokeWidth={2} />
          </IconButton>
        )}
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

      {/* Grid — held until the screen has settled, behind a placeholder grid of
          the same geometry so the wait is the shape of the books rather than an
          empty screen. Mounting it mid-push competed with the transition for the
          UI thread and stalled the slide near its end (see `Handover`). */}
      <Handover
        ready={settled}
        skeleton={
          <View className="px-6" style={contentColumn}>
            <BookGridSkeleton width={itemWidth} columns={NUM_COLUMNS} />
          </View>
        }
      >
        <PageFade>
          <TransitionFlatList
            data={filtered}
            extraData={gridExtraData}
            keyExtractor={keyExtractor}
            numColumns={NUM_COLUMNS}
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
                  {query ? "No results." : "Nothing here yet."}
                </ThemedText>
              </View>
            }
            renderItem={renderBook}
          />
        </PageFade>
      </Handover>

      {/* Sheets mount after the drawer has settled — four BottomSheetModals is
          more than the rise can absorb in its opening frames. */}
      {settled && (
        <>
          <BookActionSheet
            visible={actionBook !== null}
            book={actionBook}
            onClose={() => setActionBook(null)}
            onOpen={openReader}
            onToggleFavorite={toggleFavorite}
            onSetStatus={updateBookStatus}
            onAddToCollection={async (bookId) => {
              const ids = await useCollectionsStore
                .getState()
                .getBookCollectionIds(bookId);
              setBookCollectionIds(ids);
              setCollectionPickerBook(bookId);
            }}
            onDelete={(bookId) => {
              const book = allBooks.find((b) => b.id === bookId) ?? null;
              setDeleteConfirmBook(book);
            }}
            onEditTitle={(bookId) => {
              const book = allBooks.find((b) => b.id === bookId) ?? null;
              setEditTitleBook(book);
            }}
          />

          <CollectionPickerSheet
            visible={collectionPickerBook !== null}
            collections={collections}
            bookCollectionIds={bookCollectionIds}
            onToggle={async (collectionId, isAdded) => {
              if (isAdded) {
                await useCollectionsStore
                  .getState()
                  .removeBookFromCollection(collectionPickerBook!, collectionId);
              } else {
                await useCollectionsStore
                  .getState()
                  .addBookToCollection(collectionPickerBook!, collectionId);
              }
              const ids = await useCollectionsStore
                .getState()
                .getBookCollectionIds(collectionPickerBook!);
              setBookCollectionIds(ids);
            }}
            onClose={() => setCollectionPickerBook(null)}
          />

          <DeleteBookSheet
            visible={deleteConfirmBook !== null}
            book={deleteConfirmBook}
            onClose={() => setDeleteConfirmBook(null)}
            onConfirm={async (bookId) => {
              await deleteBook(bookId);
              setDeleteConfirmBook(null);
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
