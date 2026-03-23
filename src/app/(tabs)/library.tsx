import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArchivedCards } from "@/components/library/archived-card";
import { BookActionSheet } from "@/components/library/book-action-sheet";
import { BookQueue } from "@/components/library/book-queue";
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
    isSyncing,
    loadBooks,
    loadDirectoryUri,
    setDirectoryUri,
    syncBooks,
    updateBookStatus,
    toggleFavorite,
  } = useBooksStore();

  const [currentReadingIndex, setCurrentReadingIndex] = useState(0);
  const [actionBook, setActionBook] = useState<Book | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
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
    loadDirectoryUri().then(() => {
      loadBooks();
      syncBooks();
    });
  }, []);

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

  const openReader = (bookId: string) => {
    router.push(`/reader/${bookId}` as any);
  };

  if (!booksDirectoryUri && !isLoading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Open Citadel" />
        <DirectoryPrompt onSelectDirectory={handleSelectDirectory} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Open Citadel" />

      {isSyncing && (
        <View style={styles.syncIndicator}>
          <ActivityIndicator color={colors.primary.default} size="small" />
          <ThemedText type="labelSm" color={colors.text.secondary}>
            SYNCING BOOKS...
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
              books={allBooks}
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
