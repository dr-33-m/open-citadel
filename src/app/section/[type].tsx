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
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookActionSheet } from "@/components/library/book-action-sheet";
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

const COLUMNS = 2;

export default function SectionScreen() {
  const colors = useColors();
  const styles = useSectionStyles(colors);
  const { type } = useLocalSearchParams<{ type: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [actionBook, setActionBook] = useState<Book | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const { syncBooks, isSyncing, clearQueue, updateBookStatus, toggleFavorite } =
    useBooksStore();

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
    router.push(`/reader/${bookId}` as any);
  };

  // Pad rows so the last row fills evenly
  const padded = useMemo(() => {
    const remainder = filtered.length % COLUMNS;
    if (remainder === 0) return filtered;
    return [
      ...filtered,
      ...Array(COLUMNS - remainder).fill(null),
    ] as (Book | null)[];
  }, [filtered]);

  // ── Collections section ──────────────────────────────────────────────────
  if (type === "collections") {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="bodyMd" color={colors.primary.default}>
              ←
            </ThemedText>
          </Pressable>
          <ThemedText type="headlineSm" style={styles.headerTitle}>
            {title}
          </ThemedText>
          <ThemedText type="labelSm" color={colors.text.secondary}>
            {collections.length}
          </ThemedText>
          <Pressable
            onPress={() => setShowNewCollection(true)}
            style={styles.backButton}
            hitSlop={8}
          >
            <Plus size={18} color={colors.text.primary} />
          </Pressable>
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
            <Pressable onPress={() => setQuery("")}>
              <X size={16} color={colors.text.secondary} />
            </Pressable>
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
            <Pressable
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
            </Pressable>
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
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText type="bodyMd" color={colors.primary.default}>
            ←
          </ThemedText>
        </Pressable>
        <ThemedText type="headlineSm" style={styles.headerTitle}>
          {title}
        </ThemedText>
        <ThemedText type="labelSm" color={colors.text.secondary}>
          {sectionBooks.length}
        </ThemedText>
        {type === "all" && (
          <Pressable onPress={syncBooks} style={styles.backButton} hitSlop={8}>
            <RefreshCw
              size={16}
              color={isSyncing ? colors.primary.default : colors.text.secondary}
            />
          </Pressable>
        )}
        {type === "queue" && (
          <Pressable onPress={clearQueue} style={styles.backButton} hitSlop={8}>
            <Trash2 size={16} color={colors.text.secondary} />
          </Pressable>
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
          <Pressable onPress={() => setQuery("")}>
            <X size={16} color={colors.text.secondary} />
          </Pressable>
        )}
      </View>

      {/* Grid */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: insets.bottom + spacing[8] },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText type="bodySm" color={colors.text.secondary}>
              {query ? "No results." : "Nothing here yet."}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.row}>
            {padded.map((book, i) =>
              book ? (
                <Pressable
                  key={book.id}
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
                </Pressable>
              ) : (
                <View key={`pad-${i}`} style={styles.bookItem} />
              ),
            )}
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
        grid: { paddingHorizontal: SIDE_PAD },
        row: { flexDirection: "row", flexWrap: "wrap", gap: ITEM_GAP },
        bookItem: { width: ITEM_WIDTH, gap: spacing[2] },
        cover: {
          aspectRatio: 2 / 3,
          backgroundColor: colors.surface.low,
          overflow: "hidden",
        },
        coverImage: { width: "100%", height: "100%" },
        coverPlaceholder: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface.mid,
        },
        initial: { fontSize: 28, fontFamily: fontFamily.serif },
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
