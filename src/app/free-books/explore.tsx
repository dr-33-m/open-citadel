import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Handover } from "@/components/navigation/handover";
import { SearchHeader } from "@/components/search-header";
import { ThemedView } from "@/components/themed-view";
import { layout } from "@/constants/theme";
import { CatalogResults } from "@/features/free-books/components/catalog-results";
import { CatalogShelves } from "@/features/free-books/components/catalog-shelves";
import { CatalogShelvesSkeleton } from "@/features/free-books/components/catalog-shelves-skeleton";
import { catalogPreviewReady } from "@/features/free-books/utils/catalog-preview";
import { useFreeBooksExplore } from "@/features/free-books/hooks/use-free-books-explore";
import { useSettledOnce } from "@/navigation/use-settled-once";

/**
 * Free books from Project Gutenberg: its shelves, a row each, and a search
 * over its whole catalog, laid out like the podcasts' Explore.
 */
export default function FreeBooksExploreScreen() {
  const insets = useSafeAreaInsets();
  const landed = useSettledOnce();
  const explore = useFreeBooksExplore(landed);
  const bottomPadding = layout.scrollBottom + insets.bottom;
  // Seen before (the shelves are cached): the page opens on its shelves, in
  // the real scroller, so it can be scrolled as it arrives.
  // Decided once, as the page opens: shelves asked for at the tap arrive
  // during the rise, and trading a skeleton for nine tiles then is the mount
  // mid-slide this is here to avoid.
  const [previewed] = React.useState(() => catalogPreviewReady(explore.shelves));
  const shelves = (
    <CatalogShelves
      shelves={explore.shelves}
      bottomPadding={bottomPadding}
      ready={landed}
      onDrawn={explore.onDrawn}
      onOpen={explore.openBook}
      onViewAll={explore.openShelf}
    />
  );

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <SearchHeader
        {...explore.search}
        drawer
        title="Free Books"
        placeholder="Search titles and authors"
        canSearch
        debounce={450}
        loading={explore.finding}
        onBack={explore.close}
      />
      <View className="flex-1">
        {explore.view === "search" ? (
          <CatalogResults
            results={explore.results}
            emptyText={explore.searchEmptyText}
            bottomPadding={bottomPadding}
            onOpen={explore.openBook}
          />
        ) : previewed ? (
          shelves
        ) : (
          // Not seen before: a skeleton holds the page while the shelves are
          // fetched, and they mount under it once the drawer has finished
          // rising (a list landing mid-rise makes a drawer stagger).
          <Handover ready={landed} skeleton={<CatalogShelvesSkeleton />}>
            {shelves}
          </Handover>
        )}
      </View>
    </ThemedView>
  );
}
