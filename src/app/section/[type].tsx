import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Plus,
  RefreshCw,
  Search,
  SquareLibrary,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { Touchable } from "@/components/ui/touchable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookActionSheet } from "@/components/library/book-action-sheet";
import { CollectionPickerSheet } from "@/components/library/collection-picker-sheet";
import { DeleteBookSheet } from "@/components/library/delete-book-sheet";
import { EditTitleSheet } from "@/components/library/edit-title-sheet";
import { NewCollectionPrompt } from "@/components/library/new-collection-prompt";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { fontFamily, spacing } from "@/constants/theme";
import type { books as booksTable } from "@/db/schema";
import { useColors } from "@/hooks/use-colors";
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

const SECTION_LABELS: Record<string, string> = {
  reading: "Currently Reading",
  all: "All Books",
  queue: "Queue",
  favorites: "Favorites",
  archived: "Have Read",
  collections: "Collections",
};

const NUM_COLUMNS = 2;

export default function SectionScreen() {
  const colors = useColors();
  const styles = useSectionStyles(colors);
  const { type } = useLocalSearchParams<{ type: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [actionBook, setActionBook] = useState<Book | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [collectionPickerBook, setCollectionPickerBook] = useState<string | null>(null);
  const [bookCollectionIds, setBookCollectionIds] = useState<string[]>([]);
  const [deleteConfirmBook, setDeleteConfirmBook] = useState<Book | null>(null);
  const [editTitleBook, setEditTitleBook] = useState<Book | null>(null);
  const { syncBooks, clearQueue, updateBookStatus, toggleFavorite, deleteBook, updateBookTitle } =
    useBooksStore();
  const sync = useSyncState();

  const readingBooks = useCurrentlyReading();
  const allBooks = useAllBooks();
  const queuedBooks = useQueuedBooks();
  const favoriteBooks = useFavoriteBooks();
  const archivedBooks = useArchivedBooks();

  const { collections, loadCollections, createCollection } =
    useCollectionsStore();

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

  const openReader = (bookId: string) => {
    const book = allBooks.find((b) => b.id === bookId);
    if (!book?.filePath) return;
    router.push(`/reader/${bookId}` as any);
  };

  // ── Collections section ──────────────────────────────────────────────────
  if (type === "collections") {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Touchable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="bodyMd" color={colors.primary.default}>
              ←
            </ThemedText>
          </Touchable>
          <ThemedText type="headlineSm" style={styles.headerTitle}>
            {title}
          </ThemedText>
          <ThemedText type="labelSm" color={colors.text.secondary}>
            {collections.length}
          </ThemedText>
          <Touchable
            onPress={() => setShowNewCollection(true)}
            style={styles.backButton}
            hitSlop={8}
          >
            <Plus size={18} color={colors.text.primary} />
          </Touchable>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Search size={16} color={colors.text.secondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search collections…"
            placeholderTextColor={colors.text.secondary}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Touchable onPress={() => setQuery("")}>
              <X size={16} color={colors.text.secondary} />
            </Touchable>
          )}
        </View>

        {/* Grid */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.collectionGrid,
            { paddingBottom: insets.bottom + spacing[8] },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {filteredCollections.map((collection) => (
            <Touchable
              key={collection.id}
              style={styles.collectionCell}
              onPress={() => router.push(`/collection/${collection.id}` as any)}
            >
              <SquareLibrary size={22} color={colors.primary.default} />
              <ThemedText type="bodyMd" numberOfLines={2}>
                {collection.name}
              </ThemedText>
              <ThemedText type="labelSm" color={colors.primary.default}>
                {collection.count} {collection.count === 1 ? "BOOK" : "BOOKS"}
              </ThemedText>
            </Touchable>
          ))}
        </ScrollView>

        <NewCollectionPrompt
          visible={showNewCollection}
          onClose={() => setShowNewCollection(false)}
          onCreate={async (name) => {
            await createCollection(name);
            await loadCollections();
            setShowNewCollection(false);
          }}
        />
      </ThemedView>
    );
  }

  // ── Books sections ───────────────────────────────────────────────────────
  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Touchable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText type="bodyMd" color={colors.primary.default}>
            ←
          </ThemedText>
        </Touchable>
        <ThemedText type="headlineSm" style={styles.headerTitle}>
          {title}
        </ThemedText>
        <ThemedText type="labelSm" color={colors.text.secondary}>
          {sectionBooks.length}
        </ThemedText>
        {type === "all" && (
          <Touchable onPress={syncBooks} style={styles.backButton} hitSlop={8}>
            <RefreshCw
              size={16}
              color={
                sync.status === "running"
                  ? colors.primary.default
                  : colors.text.secondary
              }
            />
          </Touchable>
        )}
        {type === "queue" && (
          <Touchable onPress={clearQueue} style={styles.backButton} hitSlop={8}>
            <Trash2 size={16} color={colors.text.secondary} />
          </Touchable>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Search size={16} color={colors.text.secondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by title or author…"
          placeholderTextColor={colors.text.secondary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Touchable onPress={() => setQuery("")}>
            <X size={16} color={colors.text.secondary} />
          </Touchable>
        )}
      </View>

      {/* Grid */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: SIDE_PAD,
          paddingBottom: insets.bottom + spacing[8],
        }}
        columnWrapperStyle={{ gap: ITEM_GAP, marginBottom: ITEM_GAP }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText type="bodySm" color={colors.text.secondary}>
              {query ? "No results." : "Nothing here yet."}
            </ThemedText>
          </View>
        }
        renderItem={({ item: book }) => (
          <Touchable
            style={styles.bookItem}
            onPress={() => openReader(book.id)}
            onLongPress={() => setActionBook(book)}
          >
            <View style={styles.cover}>
              {book.coverUrl ? (
                <Image
                  source={{ uri: book.coverUrl }}
                  style={styles.coverImage}
                />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <ThemedText
                    type="headlineSm"
                    color={colors.surface.highest}
                    style={styles.initial}
                  >
                    {book.title.charAt(0).toUpperCase()}
                  </ThemedText>
                  <ThemedText
                    type="labelSm"
                    color={colors.text.secondary}
                    style={styles.coverTitle}
                    numberOfLines={2}
                  >
                    {book.title}
                  </ThemedText>
                </View>
              )}
              {!book.filePath && (
                <View style={styles.syncBadge}>
                  <RefreshCw size={14} color={colors.text.secondary} />
                </View>
              )}
            </View>
            <ThemedText
              type="bodySm"
              numberOfLines={2}
              style={styles.bookTitle}
            >
              {book.title}
            </ThemedText>
            <ThemedText
              type="labelSm"
              color={colors.text.secondary}
              numberOfLines={1}
            >
              {book.author}
            </ThemedText>
          </Touchable>
        )}
      />

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
    </ThemedView>
  );
}

const ITEM_GAP = spacing[4];
const SIDE_PAD = spacing[6];
const ITEM_WIDTH =
  (Dimensions.get("window").width - SIDE_PAD * 2 - ITEM_GAP) / 2;

// Collection grid constants — two columns with a gap
const COL_GAP = spacing[4];
const COL_SIDE_PAD = spacing[6];
const COL_CELL_WIDTH =
  (Dimensions.get("window").width - COL_SIDE_PAD * 2 - COL_GAP) / 2;

function useSectionStyles(colors: ReturnType<typeof useColors>) {
  return useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1 },
        header: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[4],
          gap: spacing[3],
        },
        backButton: {
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
        },
        headerTitle: { flex: 1 },
        searchRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing[3],
          marginHorizontal: spacing[6],
          marginBottom: spacing[5],
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3],
          backgroundColor: colors.surface.low,
          borderWidth: 1,
          borderColor: colors.surface.highest,
        },
        searchInput: {
          flex: 1,
          fontFamily: fontFamily.sans,
          fontSize: 14,
          color: colors.text.primary,
          padding: 0,
        },
        scroll: { flex: 1 },
        // Books grid
        bookItem: { width: ITEM_WIDTH, gap: spacing[2] },
        cover: {
          aspectRatio: 2 / 3,
          backgroundColor: colors.surface.low,
          overflow: "hidden",
        },
        syncBadge: {
          position: "absolute",
          top: spacing[2],
          left: spacing[2],
          backgroundColor: colors.surface.base,
          borderRadius: 11,
          padding: 3,
        },
        coverImage: { width: "100%", height: "100%" },
        coverPlaceholder: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface.mid,
        },
        initial: { fontSize: 28, fontFamily: fontFamily.serif },
        coverTitle: {
          position: "absolute",
          bottom: spacing[2],
          paddingHorizontal: spacing[2],
          textAlign: "center",
          fontSize: 9,
        },
        bookTitle: { lineHeight: 18 },
        empty: {
          paddingTop: spacing[16],
          alignItems: "center",
          width: "100%",
        },
        // Collections grid
        collectionGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          paddingHorizontal: COL_SIDE_PAD,
          gap: COL_GAP,
        },
        collectionCell: {
          width: COL_CELL_WIDTH,
          backgroundColor: colors.surface.low,
          padding: spacing[5],
          gap: spacing[2],
        },
      }),
    [colors],
  );
}
