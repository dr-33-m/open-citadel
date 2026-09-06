import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { ChartNoAxesGantt, Plus, ZodiacPisces } from "@/components/icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  ScrollView,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

import { RowFade } from "@/components/scroll-fades";
import { ArchivedCards } from "@/components/library/archived-card";
import { BookActionSheet } from "@/components/library/book-action-sheet";
import { BookQueue } from "@/components/library/book-queue";
import { DeleteBookSheet } from "@/components/library/delete-book-sheet";
import { EditTitleSheet } from "@/components/library/edit-title-sheet";
import { CollectionGrid } from "@/components/library/collection-grid";
import { CollectionPickerSheet } from "@/components/library/collection-picker-sheet";
import { CurrentlyReadingCard } from "@/components/library/currently-reading-card";
import { DirectoryPrompt } from "@/components/library/directory-prompt";
import { Favorites } from "@/components/library/favorites";
import { NewCollectionPrompt } from "@/components/library/new-collection-prompt";
import { ThemedView } from "@/components/themed-view";
import { Fab, fabClearance } from "@/components/ui/fab";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { LibrarySkeleton } from "@/components/skeletons/library-skeleton";
import { PullToSync } from "@/components/library/pull-to-sync";
import { MaxContentWidth, iconSize, layout } from "@/constants/theme";
import type { books as booksTable } from "@/db/schema";
import { cn } from "@/lib/cn";
import { asColor } from "@/utils/colors";
import { HUB, useHubStore } from "@/stores/hub";
import { pickBooksDirectory } from "@/services/book-sync";
import {
  useAllBooks,
  useArchivedBooks,
  useBooksStore,
  useCurrentlyReading,
  useFavoriteBooks,
  useQueuedBooks,
  useSyncRunning,
} from "@/stores/books";
import { useCollectionsStore } from "@/stores/collections";
import { useShallow } from "zustand/shallow";

type Book = typeof booksTable.$inferSelect;

// The content column: centred and capped on wide screens, pixel-identical on
// phones (the cap never bites below 800). NOT applied to the vertical scroll
// container as a whole — the currently-reading pager below pages full-window
// width and must keep its full-width viewport; the cap goes inside each page
// and around the sections that don't page.
const contentColumn: ViewStyle = {
  maxWidth: MaxContentWidth,
  width: "100%",
  alignSelf: "center",
};

/**
 * The hub's header, and the map of the app: the screen to the left of the
 * Library on one side, the screen to its right on the other. The same two
 * moves the swipe gesture makes, spelled out for anyone who never tries the
 * swipe — and drawn with the destinations' own icons rather than chevrons,
 * because what matters here is where you land, not which way you travel.
 *
 * Rendered in all three of this screen's states (booting, empty, loaded) so
 * the way out of the Library never depends on whether it has any books in it.
 */
function LibraryHeader({
  onOpenTimeline,
  onOpenSamwell,
}: {
  onOpenTimeline: () => void;
  onOpenSamwell: () => void;
}) {
  const foreground = useCSSVariable("--color-foreground");
  // His mark carries the gold everywhere it appears, so the one control on
  // this header that is him reads as him.
  const primary = useCSSVariable("--color-primary");
  return (
    <ScreenHeader
      title="Library"
      leftIcon={
        <ChartNoAxesGantt size={iconSize.default} color={asColor(foreground)} />
      }
      leftLabel="Timeline"
      onLeftPress={onOpenTimeline}
      rightIcon={<ZodiacPisces size={iconSize.default} color={asColor(primary)} />}
      rightLabel="Samwell"
      onRightPress={onOpenSamwell}
    />
  );
}

export function LibraryPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // The pager's page width, its scrollTo math and its index math all derive
  // from this one reactive value — a stale snapshot desyncs scrollTo.
  const { width: windowWidth } = useWindowDimensions();

  /*
   * Selectors, never a bare `useBooksStore()`.
   *
   * That is what this was, and it re-ran the whole Library — every shelf,
   * every book card — on every write the store made. It mattered little while
   * a scan was something you went and asked for; it matters now that one runs
   * at every launch, on the screen the app opens on. Measured on device: 18
   * full renders of this tree over a single launch scan of nine files.
   *
   * The actions come through `useShallow` because they are defined once and
   * never change, so the comparison always passes and this never re-renders
   * for them. The two pieces of state that ARE read come through their own
   * selectors, and the scan comes through as a BOOLEAN — the progress
   * counters tick several times a second and only `SyncIndicator` reads them,
   * which it does for itself.
   */
  const booksDirectoryUri = useBooksStore((s) => s.booksDirectoryUri);
  const isLoading = useBooksStore((s) => s.isLoading);
  const syncRunning = useSyncRunning();
  const {
    loadBooks,
    loadDirectoryUri,
    setDirectoryUri,
    initLibrary,
    importBooks,
    syncBooks,
    scanOnLaunch,
    hydrateSyncState,
    updateBookStatus,
    toggleFavorite,
    deleteBook,
    updateBookTitle,
  } = useBooksStore(
    useShallow((s) => ({
      loadBooks: s.loadBooks,
      loadDirectoryUri: s.loadDirectoryUri,
      setDirectoryUri: s.setDirectoryUri,
      initLibrary: s.initLibrary,
      importBooks: s.importBooks,
      syncBooks: s.syncBooks,
      scanOnLaunch: s.scanOnLaunch,
      hydrateSyncState: s.hydrateSyncState,
      updateBookStatus: s.updateBookStatus,
      toggleFavorite: s.toggleFavorite,
      deleteBook: s.deleteBook,
      updateBookTitle: s.updateBookTitle,
    })),
  );

  const [currentReadingIndex, setCurrentReadingIndex] = useState(0);
  const [actionBook, setActionBook] = useState<Book | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [deleteConfirmBook, setDeleteConfirmBook] = useState<Book | null>(null);
  const [editTitleBook, setEditTitleBook] = useState<Book | null>(null);
  const [collectionPickerBook, setCollectionPickerBook] = useState<
    string | null
  >(null);
  const [bookCollectionIds, setBookCollectionIds] = useState<string[]>([]);
  // The store starts empty (no directory, no books) — until the boot sequence
  // below has loaded it, "no data yet" must not be rendered as "not set up".
  const [booted, setBooted] = useState(false);
  const readingScrollRef = useRef<ScrollView>(null);

  const { collections, loadCollections, createCollection } =
    useCollectionsStore();

  const currentlyReading = useCurrentlyReading();
  const queuedBooks = useQueuedBooks();
  const archivedBooks = useArchivedBooks();
  const favoriteBooks = useFavoriteBooks();
  const allBooks = useAllBooks();
  /* A fresh array every render is a new prop for the memo'd shelf below, which
     is the whole point of memoizing it. */
  const allBooksPreview = React.useMemo(() => allBooks.slice(0, 20), [allBooks]);

  // Auto-scroll back when a currently-reading book is removed. Also re-scrubs
  // the scroll target when the window width changes (rotation/foldables), so
  // the offset stays synced to the same width the pages are laid out with.
  useEffect(() => {
    if (currentlyReading.length === 0) {
      setCurrentReadingIndex(0);
      return;
    }
    if (currentReadingIndex >= currentlyReading.length) {
      const next = currentlyReading.length - 1;
      setCurrentReadingIndex(next);
      readingScrollRef.current?.scrollTo({
        x: next * windowWidth,
        animated: true,
      });
    }
  }, [currentlyReading.length, windowWidth]);

  useEffect(() => {
    const boot = async () => {
      try {
        // iOS: ensure the owned library folder exists and is the scan root.
        if (process.env.EXPO_OS === "ios") await initLibrary();
        await loadDirectoryUri();
        await loadBooks();
        await hydrateSyncState();
        // Enough state has loaded to decide empty vs configured — hand off
        // before the launch scan, which flips sync.status to running and shows
        // its own indicator.
        setBooted(true);
        /*
         * The launch scan, on both platforms and announced by a toast.
         *
         * Here rather than in the root layout because this is the hub's
         * initial page and mounts with the app, so "the Library booted" and
         * "the app opened" are the same moment — and because the ordering that
         * matters is the one above it: `hydrateSyncState` has to have picked
         * up a job the last app kill interrupted before the scan can decide it
         * has nothing to add.
         *
         * It used to be iOS-only, on the reasoning that Android books arrive
         * through a folder the user picked rather than through the Files app.
         * That is true of how they get INTO the folder and says nothing about
         * when the app should look at it, which is the whole complaint: a book
         * dropped in from a browser download sat there until the reader went
         * to All Books and pressed a button.
         */
        await scanOnLaunch();
      } catch (err) {
        console.error("Library boot failed:", err);
        // Never strand the user on the spinner — the empty state's own
        // gating still applies on top of booted.
        setBooted(true);
      }
    };
    boot();
  }, []);

  // iOS: re-scan the owned folder when the app returns to the foreground so
  // EPUBs dropped in via the Files app get imported. Idempotent — unchanged
  // files are skipped, and syncBooks() no-ops while a sync is already running.
  useEffect(() => {
    if (process.env.EXPO_OS !== "ios") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncBooks();
    });
    return () => sub.remove();
  }, [syncBooks]);

  // Reload books when tab is focused so status changes made in the reader
  // (e.g. a book moving to "currently reading") are reflected immediately.
  useFocusEffect(
    useCallback(() => {
      loadBooks();
      loadCollections();
    }, [loadBooks, loadCollections]),
  );

  /*
   * A pull says "look again", and it is answered whether or not there is
   * anything to find: the same notice the launch scan raises, so a pull that
   * turns up nothing says "No new books" rather than opening a gap, closing it
   * and leaving the reader to guess.
   */
  const handlePullSync = useCallback(() => {
    void syncBooks({ notify: true });
  }, [syncBooks]);

  const handleSelectDirectory = async () => {
    const uri = await pickBooksDirectory();
    if (uri) {
      await setDirectoryUri(uri);
    }
  };

  // iOS: pick EPUBs via the document picker and copy them into the owned folder.
  const handleGetStarted = async () => {
    await importBooks();
  };

  // The two screens either side of the hub. Stable identities so the swipe
  // gesture they back doesn't rebuild on every render.
  // Peers, not destinations: the header buttons move the pager rather than
  // navigating, so they land on exactly the page a swipe would have.
  const goTo = useHubStore((s) => s.goTo);
  const openTimeline = useCallback(() => goTo(HUB.timeline), [goTo]);
  const openSamwell = useCallback(() => goTo(HUB.samwell), [goTo]);

  const openReader = (bookId: string) => {
    const book = allBooks.find((b) => b.id === bookId);
    if (!book?.filePath) return; // still being copied in Phase 2
    router.push(`/reader/${bookId}` as any);
  };

  const isIOS = process.env.EXPO_OS === "ios";
  // iOS always has an owned folder set, so gate on whether any books exist.
  // Android gates on whether a folder has been picked (unchanged behavior).
  // Both require boot to have finished — the store's initial empty state is
  // "not loaded yet", not "not configured".
  const showEmptyState = !booted
    ? false
    : isIOS
      ? allBooks.length === 0 && !syncRunning && !isLoading
      : !booksDirectoryUri && !isLoading;

  // Boot-in-progress: the shape of the Library rather than either branch, so
  // neither the setup prompt nor an empty scaffold can flash. A skeleton and
  // not a spinner — this is the first screen anyone sees, and it should arrive
  // as the page filling in rather than as a jump from nothing.
  if (!booted) {
    return (
        <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
          <LibraryHeader onOpenTimeline={openTimeline} onOpenSamwell={openSamwell} />
          <LibrarySkeleton />
        </ThemedView>
    );
  }

  if (showEmptyState) {
    return (
        <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
          <LibraryHeader onOpenTimeline={openTimeline} onOpenSamwell={openSamwell} />
          <DirectoryPrompt
            onPress={isIOS ? handleGetStarted : handleSelectDirectory}
          />
        </ThemedView>
    );
  }

  return (
      <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
        <LibraryHeader onOpenTimeline={openTimeline} onOpenSamwell={openSamwell} />

        {/* Pull down at the top to start a scan, and the gap it opens is
            where every scan reports itself — the one at launch and the button
            in All Books included. It carries the page's scroll fade, which
            replaces the header's bottom rule: content passes under the bar and
            fades rather than being cut off by a hard line. */}
        <PullToSync
          running={syncRunning}
          onSync={handlePullSync}
          contentContainerClassName="pt-6"
          contentContainerStyle={{
            paddingBottom:
              layout.scrollBottom +
              (isIOS ? fabClearance(insets.bottom) : insets.bottom),
          }}
        >
            {/* Currently Reading */}
            {currentlyReading.length > 0 && (
              <View className="gap-4 mb-8">
                <SectionHeader
                  title="Currently Reading"
                  rightAction={{
                    text: "VIEW ALL",
                    onPress: () => router.push("/section/reading" as any),
                  }}
                />
                <RowFade>
                  <ScrollView
                    ref={readingScrollRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    /* On momentum end, not on scroll. The index only feeds the
                       dot indicator below, which has nothing to say until a page
                       has actually settled — but `onScroll` ran a full React
                       render of this screen on every frame of every swipe, on the
                       one screen that is also hosting the hub's own gesture. One
                       render per page turn instead of sixty per second. */
                    onMomentumScrollEnd={(e) => {
                      const index = Math.round(
                        e.nativeEvent.contentOffset.x / windowWidth,
                      );
                      setCurrentReadingIndex(index);
                    }}
                  >
                    {currentlyReading.map((book) => (
                      <View
                        key={book.id}
                        className="px-6"
                        style={{ width: windowWidth }}
                      >
                        {/* The pager's page math owns the full-window width; the
                            card inside is what gets capped to the content column. */}
                        <View style={contentColumn}>
                          <CurrentlyReadingCard
                            book={book}
                            onPress={() => openReader(book.id)}
                            onLongPress={() => setActionBook(book)}
                          />
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </RowFade>

                {currentlyReading.length > 1 && (
                  <View className="flex-row justify-center gap-2 pt-2">
                    {currentlyReading.map((_, i) => (
                      <View
                        key={i}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full bg-surface-tertiary",
                          i === currentReadingIndex && "w-4 bg-primary",
                        )}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Queue, Favorites, Have Read, Collections, All Books — no paging
                math here, so they all sit inside the content column. */}
            <View style={contentColumn}>
              {/* Queue */}
              {queuedBooks.length > 0 && (
                <View className="gap-4 mb-8">
                  <SectionHeader
                    title="Queue"
                    rightAction={{
                      text: "VIEW ALL",
                      onPress: () => router.push("/section/queue" as any),
                    }}
                  />
                  <BookQueue
                    books={queuedBooks}
                    onBookPress={openReader}
                    onBookLongPress={setActionBook}
                  />
                </View>
              )}

              {/* Favorites */}
              {favoriteBooks.length > 0 && (
                <View className="gap-4 mb-8">
                  <SectionHeader
                    title="Favorites"
                    rightAction={{
                      text: "VIEW ALL",
                      onPress: () => router.push("/section/favorites" as any),
                    }}
                  />
                  <Favorites
                    books={favoriteBooks}
                    onBookPress={openReader}
                    onBookLongPress={setActionBook}
                  />
                </View>
              )}

              {/* Have Read */}
              {archivedBooks.length > 0 && (
                <View className="gap-4 mb-8">
                  <SectionHeader
                    title="Have Read"
                    rightAction={{
                      text: "VIEW ALL",
                      onPress: () => router.push("/section/archived" as any),
                    }}
                  />
                  <ArchivedCards
                    books={archivedBooks}
                    onBookPress={openReader}
                    onBookLongPress={setActionBook}
                  />
                </View>
              )}

              {/* Collections */}
              <View className="gap-4 mb-8">
                <SectionHeader
                  title="Collections"
                  rightAction={{
                    text: "VIEW ALL",
                    onPress: () => router.push("/section/collections" as any),
                  }}
                />
                <CollectionGrid
                  collections={collections}
                  onPress={(colId) => router.push(`/collection/${colId}` as any)}
                  onCreateCollection={() => setShowNewCollection(true)}
                />
              </View>

              {/* All Books */}
              {allBooks.length > 0 && (
                <View className="gap-4 mb-8">
                  <SectionHeader
                    title="All Books"
                    rightAction={{
                      text: "VIEW ALL",
                      onPress: () => router.push("/section/all" as any),
                    }}
                  />
                  <BookQueue
                    books={allBooksPreview}
                    onBookPress={openReader}
                    onBookLongPress={setActionBook}
                  />
                </View>
              )}
            </View>
        </PullToSync>

        {/* Adding books moved off the header when both of its sides became
            navigation. It is this screen's one creative action, so it gets the
            same floating button the Timeline gives its own. iOS only, matching
            the header button it replaces — on Android books arrive through the
            picked folder, not a document picker. */}
        {isIOS && (
          <Fab
            icon={Plus}
            accessibilityLabel="Add books"
            bottomOffset={insets.bottom}
            onPress={handleGetStarted}
          />
        )}

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

        <NewCollectionPrompt
          visible={showNewCollection}
          onClose={() => setShowNewCollection(false)}
          onCreate={async (name) => {
            await createCollection(name);
            setShowNewCollection(false);
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
      </ThemedView>
  );
}
