import React, {
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import { View } from "react-native";
import type { Locator } from "@dr33m/react-native-readium";

import {
  BookmarkRow,
  type BookmarkRowData,
} from "@/components/reader/toc-bookmark-row";
import {
  FILL,
  parseJson,
  type Bookmark,
  type RowColors,
} from "@/components/reader/toc-shared";
import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { SearchBar } from "@/components/ui/search-bar";
import { Sheet } from "@/components/ui/sheet";

/** A bookmark matches on its chapter, its note, or its page ("page 12"). */
function matchesBookmark(row: BookmarkRowData, query: string): boolean {
  const page = row.page != null ? `page ${row.page}` : null;
  return [row.chapter, row.note, page].some((field) =>
    field?.toLowerCase().includes(query),
  );
}

export function BookmarksTab({
  bookmarkItems,
  onBookmarkPress,
  onUpdateBookmarkNote,
  colors,
}: {
  bookmarkItems: Bookmark[];
  onBookmarkPress: (locator: Locator) => void;
  onUpdateBookmarkNote: (id: string, note: string) => Promise<void>;
  colors: RowColors;
}) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Filtered against the deferred query, so a burst of keystrokes re-filters
  // and re-renders the list once rather than on every letter.
  const deferredSearch = useDeferredValue(search);

  // Stable handlers: every prop BookmarkRow receives keeps its identity
  // across renders, so a keystroke (which never reaches the list) and an
  // edit-session change re-render only the affected row, never the sheet.
  const handleCancelEdit = useCallback(() => setEditingNoteId(null), []);
  const handleSaveNote = useCallback(
    (id: string, note: string) => {
      void onUpdateBookmarkNote(id, note);
      setEditingNoteId(null);
    },
    [onUpdateBookmarkNote],
  );

  const parsed = useMemo<BookmarkRowData[]>(() => {
    const rows = bookmarkItems.map((bm) => ({
      id: bm.id,
      chapter: bm.chapter,
      page: bm.page,
      note: bm.note,
      createdAt: bm.createdAt,
      locator: parseJson<Locator | null>(bm.locator, null),
    }));
    rows.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
    return rows;
  }, [bookmarkItems]);

  const rows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return parsed;
    return parsed.filter((bm) => matchesBookmark(bm, query));
  }, [parsed, deferredSearch]);

  const renderItem = useCallback(
    ({ item }: { item: BookmarkRowData }) => (
      <BookmarkRow
        data={item}
        colors={colors}
        onBookmarkPress={onBookmarkPress}
        onEditNote={setEditingNoteId}
        isEditing={editingNoteId === item.id}
        onCancelEdit={handleCancelEdit}
        onSaveNote={handleSaveNote}
      />
    ),
    [colors, onBookmarkPress, editingNoteId, handleCancelEdit, handleSaveNote],
  );

  if (bookmarkItems.length === 0) {
    return (
      <ThemedText
        type="bodySm"
        color={colors.mutedForeground}
        className="px-6 py-6"
      >
        No bookmarks yet. Tap the bookmark icon to save your place.
      </ThemedText>
    );
  }

  const noMatches = rows.length === 0;

  return (
    <View style={FILL}>
      {/* Pinned above the list, not its header, for the same reason as the
          highlights search: inside the scroll content, filtering changed the
          height under the focused field and moved it. Uncontrolled, so the
          native buffer owns the text (see SearchBar). */}
      <View className="mx-6 mb-6 mt-4">
        <SearchBar
          variant="filled"
          placeholder="Search bookmarks or notes…"
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      {noMatches ? (
        <ThemedText type="bodySm" color={colors.mutedForeground} className="px-6">
          No bookmarks match.
        </ThemedText>
      ) : (
        <PageFade edges="both" surface="popover">
          <Sheet.FlatList
            style={FILL}
            data={rows}
            extraData={editingNoteId}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </PageFade>
      )}
    </View>
  );
}
