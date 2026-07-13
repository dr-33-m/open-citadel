import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { spacing } from "@/constants/theme";
import type { books as booksTable } from "@/db/schema";
import { useColors } from "@/hooks/use-colors";
import { pickBooksDirectory } from "@/services/book-sync";
import {
  useAllBooks,
  useArchivedBooks,
  useBooksStore,
  useCurrentlyReading,
  useFavoriteBooks,
  useQueuedBooks,
  useSyncState,
} from "@/stores/books";
import { useCollectionsStore } from "@/stores/collections";

type Book = typeof booksTable.$inferSelect;

export default function LibraryScreen() {
  const colors = useColors();
  const styles = useStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    booksDirectoryUri,
    isLoading,
    loadBooks,
    loadDirectoryUri,
    setDirectoryUri,
    initLibrary,
    importBooks,
    syncBooks,
    hydrateSyncState,
    updateBookStatus,
    toggleFavorite,
    deleteBook,
    updateBookTitle,
  } = useBooksStore();

  const sync = useSyncState();

  const [currentReadingIndex, setCurrentReadingIndex] = useState(0);
  const [actionBook, setActionBook] = useState<Book | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [deleteConfirmBook, setDeleteConfirmBook] = useState<Book | null>(null);
  const [editTitleBook, setEditTitleBook] = useState<Book | null>(null);
  const [collectionPickerBook, setCollectionPickerBook] = useState<
    string | null
  >(null);
  const [bookCollectionIds, setBookCollectionIds] = useState<string[]>([]);
  const readingScrollRef = useRef<ScrollView>(null);

  const { collections, loadCollections, createCollection } =
    useCollectionsStore();

  const currentlyReading = useCurrentlyReading();
  const queuedBooks = useQueuedBooks();
  const archivedBooks = useArchivedBooks();
  const favoriteBooks = useFavoriteBooks();
  const allBooks = useAllBooks();

  // Auto-scroll back when a currently-reading book is removed
  useEffect(() => {
    if (currentlyReading.length === 0) {
      setCurrentReadingIndex(0);
      return;
    }
    if (currentReadingIndex >= currentlyReading.length) {
      const next = currentlyReading.length - 1;
      setCurrentReadingIndex(next);
      readingScrollRef.current?.scrollTo({
        x: next * Dimensions.get("window").width,
        animated: true,
      });
    }
  }, [currentlyReading.length]);

  useEffect(() => {
    const boot = async () => {
      // iOS: ensure the owned library folder exists and is the scan root.
      if (Platform.OS === "ios") await initLibrary();
      await loadDirectoryUri();
      await loadBooks();
      await hydrateSyncState();
      // iOS: cold-start scan so anything dropped in via the Files app is imported.
      if (Platform.OS === "ios") await syncBooks();
    };
    boot();
  }, []);

  // iOS: re-scan the owned folder when the app returns to the foreground so
  // EPUBs dropped in via the Files app get imported. Idempotent — unchanged
  // files are skipped, and syncBooks() no-ops while a sync is already running.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
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

  const openReader = (bookId: string) => {
    const book = allBooks.find((b) => b.id === bookId);
    if (!book?.filePath) return; // still being copied in Phase 2
    router.push(`/reader/${bookId}` as any);
  };

  const isIOS = Platform.OS === "ios";
  // iOS always has an owned folder set, so gate on whether any books exist.
  // Android gates on whether a folder has been picked (unchanged behavior).
  const showEmptyState = isIOS
    ? allBooks.length === 0 && sync.status !== "running" && !isLoading
    : !booksDirectoryUri && !isLoading;

  if (showEmptyState) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Open Citadel" />
        <DirectoryPrompt
          onPress={isIOS ? handleGetStarted : handleSelectDirectory}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Open Citadel"
        rightIcon={
          isIOS ? <Plus size={22} color={colors.text.primary} /> : undefined
        }
        onRightPress={isIOS ? handleGetStarted : undefined}
      />

      {sync.status === "running" && (
        <View style={styles.syncIndicator}>
          <ActivityIndicator color={colors.primary.default} size="small" />
          <ThemedText type="labelSm" color={colors.text.secondary}>
            {sync.phase === "scanning"
              ? sync.total > 0
                ? `SCANNING ${sync.done}/${sync.total}`
                : "SCANNING..."
              : sync.phase === "importing"
                ? sync.total > 0
                  ? `IMPORTING ${sync.done}/${sync.total}`
                  : "IMPORTING..."
                : sync.phase === "preparing"
                  ? sync.total > 0
                    ? `PREPARING ${sync.done}/${sync.total}`
                    : "PREPARING..."
                  : sync.phase === "finalizing"
                    ? "FINALIZING..."
                    : "SYNCING BOOKS..."}
          </ThemedText>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Currently Reading */}
        {currentlyReading.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Currently Reading"
              rightAction={{
                text: "VIEW ALL",
                onPress: () => router.push("/section/reading" as any),
              }}
            />
            <ScrollView
              ref={readingScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                const index = Math.round(
                  e.nativeEvent.contentOffset.x /
                    Dimensions.get("window").width,
                );
                setCurrentReadingIndex(index);
              }}
            >
              {currentlyReading.map((book) => (
                <View
                  key={book.id}
                  style={{
                    width: Dimensions.get("window").width,
                    paddingHorizontal: spacing[6],
                  }}
                >
                  <CurrentlyReadingCard
                    book={book}
                    onPress={() => openReader(book.id)}
                    onLongPress={() => setActionBook(book)}
                  />
                </View>
              ))}
            </ScrollView>

            {currentlyReading.length > 1 && (
              <View style={styles.dotsRow}>
                {currentlyReading.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === currentReadingIndex && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Queue */}
        {queuedBooks.length > 0 && (
          <View style={styles.section}>
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
          <View style={styles.section}>
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
          <View style={styles.section}>
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
        <View style={styles.section}>
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
          <View style={styles.section}>
            <SectionHeader
              title="All Books"
              rightAction={{
                text: "VIEW ALL",
                onPress: () => router.push("/section/all" as any),
              }}
            />
            <BookQueue
              books={allBooks.slice(0, 20)}
              onBookPress={openReader}
              onBookLongPress={setActionBook}
            />
          </View>
        )}
      </ScrollView>

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

function useStyles(colors: ReturnType<typeof useColors>) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1 },
        scroll: { flex: 1 },
        scrollContent: { paddingBottom: spacing[8] },
        section: { gap: spacing[5], marginBottom: spacing[16] },
        syncIndicator: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing[3],
          paddingVertical: spacing[2],
        },
        dotsRow: {
          flexDirection: "row",
          justifyContent: "center",
          gap: spacing[2],
          paddingTop: spacing[2],
        },
        dot: {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.surface.highest,
        },
        dotActive: {
          backgroundColor: colors.primary.default,
          width: 16,
          borderRadius: 3,
        },
      }),
    [colors],
  );
}
