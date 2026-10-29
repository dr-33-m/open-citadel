import { useLocalSearchParams } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SearchHeader } from "@/components/search-header";
import { ThemedView } from "@/components/themed-view";
import { CatalogGrid } from "@/features/free-books/components/catalog-grid";
import { SHELF_SEARCH_DEBOUNCE, useCatalogShelfScreen } from "@/features/free-books/hooks/use-catalog-shelf-screen";
import { useSettledOnce } from "@/navigation/use-settled-once";

/** A whole Project Gutenberg shelf, two books to a row, from its VIEW ALL, with a search inside it. */
export default function CatalogShelfScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const landed = useSettledOnce();
  const screen = useCatalogShelfScreen(id);

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <SearchHeader
        {...screen.search}
        title={screen.title}
        placeholder="Search titles and authors"
        canSearch={screen.canSearch}
        debounce={SHELF_SEARCH_DEBOUNCE}
        loading={screen.finding}
        onBack={screen.back}
      />
      <CatalogGrid
        books={screen.books}
        ready={landed && !screen.loading}
        loadingMore={screen.loadingMore}
        emptyText={screen.emptyText}
        bottomInset={insets.bottom}
        onOpen={screen.open}
        onEndReached={screen.loadMore}
      />
    </ThemedView>
  );
}
