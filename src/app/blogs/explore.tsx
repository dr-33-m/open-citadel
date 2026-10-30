import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SearchHeader } from "@/components/search-header";
import { ThemedView } from "@/components/themed-view";
import { layout } from "@/constants/theme";
import { ExploreResults } from "@/features/blogs/components/explore-results";
import { ExploreSections } from "@/features/blogs/components/explore-sections";
import { useBlogsExplore } from "@/features/blogs/hooks/use-blogs-explore";
import { useSettledOnce } from "@/navigation/use-settled-once";

/**
 * Blogs worth following, by section, and a search over them that also takes
 * any blog's address, laid out like the podcasts' and free books' Explore.
 */
export default function BlogsExploreScreen() {
  const insets = useSafeAreaInsets();
  const landed = useSettledOnce();
  const explore = useBlogsExplore();
  const bottomPadding = layout.scrollBottom + insets.bottom;

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <SearchHeader
        {...explore.search}
        drawer
        title="Blogs"
        placeholder="Search blogs, or paste an address"
        canSearch
        debounce={250}
        autoCapitalize="none"
        onBack={explore.close}
      />
      <View className="flex-1">
        {explore.view === "search" ? (
          <ExploreResults
            results={explore.results}
            followed={explore.followed}
            address={explore.address}
            emptyText={explore.searchEmptyText}
            bottomPadding={bottomPadding}
            onOpen={explore.openBlog}
            onOpenAddress={explore.openAddress}
          />
        ) : (
          // The directory ships with the app, so the page opens on its first
          // sections in the real scroller, and the rest follow once the drawer
          // has finished rising.
          <ExploreSections
            sections={explore.sections}
            followed={explore.followed}
            bottomPadding={bottomPadding}
            ready={landed}
            onOpen={explore.openBlog}
          />
        )}
      </View>
    </ThemedView>
  );
}
