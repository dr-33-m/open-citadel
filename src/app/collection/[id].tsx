import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Plus, Search, Trash2, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
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

import { AddBooksSheet } from "@/components/library/add-books-sheet";
import { BookActionSheet } from "@/components/library/book-action-sheet";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { fontFamily, spacing } from "@/constants/theme";
import type { books as booksTable } from "@/db/schema";
import { useColors } from "@/hooks/use-colors";
import { useAllBooks, useBooksStore } from "@/stores/books";
import { useCollectionsStore } from "@/stores/collections";

type Book = typeof booksTable.$inferSelect;

const COLUMNS = 2;
const ITEM_GAP = spacing[4];
const SIDE_PAD = spacing[6];
const ITEM_WIDTH =
  (Dimensions.get("window").width - SIDE_PAD * 2 - ITEM_GAP) / 2;

export default function CollectionScreen() {
  const colors = useColors();
  const styles = useCollectionStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    collections,
    loadCollections,
    deleteCollection,
    addBookToCollection,
    removeBookFromCollection,
    getCollectionBooks,
  } = useCollectionsStore();
  const { updateBookStatus, toggleFavorite } = useBooksStore();
  const allBooks = useAllBooks();

  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState("");
  const [actionBook, setActionBook] = useState<Book | null>(null);
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

  const padded = useMemo(() => {
    const remainder = filtered.length % COLUMNS;
    if (remainder === 0) return filtered;
    return [
      ...filtered,
      ...Array(COLUMNS - remainder).fill(null),
    ] as (Book | null)[];
  }, [filtered]);

  const openReader = (bookId: string) => {
    router.push(`/reader/${bookId}` as any);
  };

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
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <ThemedText type="bodyMd" color={colors.primary.default}>
            ←
          </ThemedText>
        </Pressable>
        <ThemedText type="headlineSm" style={styles.headerTitle}>
          {collection?.name ?? "Collection"}
        </ThemedText>
        <ThemedText type="labelSm" color={colors.text.secondary}>
          {books.length}
        </ThemedText>
        <Pressable
          onPress={() => setShowAddBooks(true)}
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Plus size={18} color={colors.text.primary} />
        </Pressable>
        <Pressable
          onPress={handleDeleteCollection}
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Trash2 size={16} color={colors.text.secondary} />
        </Pressable>
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
              {query ? "No results." : "No books in this collection yet."}
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

      <AddBooksSheet
        visible={showAddBooks}
        allBooks={allBooks}
        existingBookIds={books.map((b) => b.id)}
        onConfirm={handleAddBooksConfirm}
        onClose={() => setShowAddBooks(false)}
      />
    </ThemedView>
  );
}

function useCollectionStyles(colors: ReturnType<typeof useColors>) {
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
        headerBtn: {
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
        coverTitle: {
          position: "absolute",
          bottom: spacing[2],
          paddingHorizontal: spacing[2],
          textAlign: "center",
          fontSize: 9,
        },
        bookTitle: { lineHeight: 18 },
        empty: { paddingTop: spacing[16], alignItems: "center", width: "100%" },
      }),
    [colors],
  );
}
