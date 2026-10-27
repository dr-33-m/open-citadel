import { useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DrawerHeader } from "@/components/drawer-header";
import { IconButton } from "@/components/icon-button";
import { CheckCheck, Share } from "@/components/icons";
import { ListEmpty } from "@/components/list-empty";
import { Handover } from "@/components/navigation/handover";
import { TransitionFlashList } from "@/components/navigation/transition-scroll";
import { RowSeparator } from "@/components/row-separator";
import { PageFade } from "@/components/scroll-fades";
import { TileGridSkeleton } from "@/components/skeletons/tile-grid-skeleton";
import { ThemedView } from "@/components/themed-view";
import { SearchBar } from "@/components/ui/search-bar";
import { LIST_DRAW_DISTANCE, contentColumn, layout } from "@/constants/theme";
import { ArticleSheets } from "@/features/blogs/components/article-sheets";
import { ArticleListSkeleton } from "@/features/blogs/components/article-list-skeleton";
import { BlogGrid } from "@/features/blogs/components/blog-grid";
import { useArticleRowRenderer } from "@/features/blogs/hooks/use-article-row-renderer";
import { useBlogSectionScreen } from "@/features/blogs/hooks/use-blog-section-screen";
import { useThemeTokens } from "@/hooks/use-theme-tokens";
import { useSettledOnce } from "@/navigation/use-settled-once";
import type { ArticleItem } from "@/services/blogs/records";

const articleKey = (item: ArticleItem) => item.id;

/** A blogs shelf's "View all": every post (or blog) on it, searchable. */
export default function BlogSectionScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  const landed = useSettledOnce();
  const screen = useBlogSectionScreen(type);
  const renderArticle = useArticleRowRenderer(screen.actions, { withBlog: true });
  const bottomPadding = layout.scrollBottom + insets.bottom;
  const empty = <ListEmpty text={screen.emptyText} />;
  const skeleton = screen.isBlogs ? <TileGridSkeleton label="Loading blogs" /> : <ArticleListSkeleton />;

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <DrawerHeader title={screen.title} subtitle={screen.subtitle} onClose={screen.close}>
        {screen.markAllRead ? (
          <IconButton onPress={screen.markAllRead} label="Mark every post read">
            <CheckCheck size={16} color={tokens["--color-primary"]} strokeWidth={2} />
          </IconButton>
        ) : null}
        {screen.exportBlogs ? (
          <IconButton onPress={screen.exportBlogs} label="Export your blogs as OPML">
            <Share size={16} color={tokens["--color-primary"]} strokeWidth={2} />
          </IconButton>
        ) : null}
      </DrawerHeader>
      <View style={contentColumn}>
        <View className="mx-6 mb-4">
          <SearchBar variant="filled" placeholder="Search by title or blog" onChangeText={screen.setQuery} returnKeyType="search" />
        </View>
      </View>
      <Handover ready={landed && screen.loaded} skeleton={skeleton}>
        <PageFade>
          {screen.isBlogs ? (
            <BlogGrid blogs={screen.blogs} empty={empty} bottomPadding={bottomPadding} onOpen={screen.actions.openBlog} />
          ) : (
            <TransitionFlashList
              data={screen.articles}
              keyExtractor={articleKey}
              renderItem={renderArticle}
              ItemSeparatorComponent={RowSeparator}
              drawDistance={LIST_DRAW_DISTANCE}
              contentContainerStyle={{ paddingBottom: bottomPadding }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={empty}
            />
          )}
        </PageFade>
      </Handover>
      <ArticleSheets actions={screen.actions} />
    </ThemedView>
  );
}
