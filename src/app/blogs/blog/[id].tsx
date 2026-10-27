import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronLeft } from "@/components/icons";
import { ListEmpty } from "@/components/list-empty";
import { ThemedView } from "@/components/themed-view";
import { ScreenHeader } from "@/components/ui/screen-header";
import { iconSize, layout } from "@/constants/theme";
import { ArticleSheets } from "@/features/blogs/components/article-sheets";
import { ArticleListSkeleton } from "@/features/blogs/components/article-list-skeleton";
import { BlogArticleList } from "@/features/blogs/components/blog-article-list";
import { BlogHero } from "@/features/blogs/components/blog-hero";
import { BlogPageSkeleton } from "@/features/blogs/components/blog-page-skeleton";
import { useArticleActions } from "@/features/blogs/hooks/use-article-actions";
import { useArticleRowRenderer } from "@/features/blogs/hooks/use-article-row-renderer";
import { useBlogScreen, type BlogParams } from "@/features/blogs/hooks/use-blog-screen";
import { useThemeTokens } from "@/hooks/use-theme-tokens";
import { useSettledOnce } from "@/navigation/use-settled-once";

/**
 * A blog: its hero, and every post of it kept here.
 *
 * Opened with `id=found` and the feed Explore knew it by, this is also the
 * preview of a blog not yet followed: every post readable, with FOLLOW as
 * the one gold thing on the page.
 */
export default function BlogScreen() {
  const params = useLocalSearchParams<BlogParams>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  const landed = useSettledOnce();
  const screen = useBlogScreen(params, landed);
  const actions = useArticleActions();
  const renderItem = useArticleRowRenderer(actions, { withBlog: false });

  // The list is mounted from the first frame with the hero as its header, so
  // the hero is drawn once and never swapped. The posts wait for the slide
  // to land (their read is held until then), with their skeleton in place.
  const empty = screen.resolving ? <ArticleListSkeleton /> : <ListEmpty text={screen.emptyText} />;
  const header = <BlogHero {...screen.hero} />;
  // Nothing known yet (an address typed into Explore): its shape until the read lands.
  const known = screen.hero.title !== '';

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title=""
        leftIcon={<ChevronLeft size={iconSize.default} color={tokens["--color-foreground"]} />}
        leftLabel="Back"
        onLeftPress={() => router.back()}
      />
      {known ? (
        <BlogArticleList
          articles={screen.articles}
          renderItem={renderItem}
          header={header}
          empty={empty}
          bottomPadding={layout.scrollBottom + insets.bottom}
          canRefresh={screen.canRefresh}
          refreshing={screen.refreshing}
          onRefresh={screen.refresh}
        />
      ) : (
        <BlogPageSkeleton />
      )}
      {landed ? <ArticleSheets actions={actions} blogLink={false} /> : null}
    </ThemedView>
  );
}
