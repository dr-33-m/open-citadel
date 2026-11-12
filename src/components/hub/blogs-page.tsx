import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fabClearance } from "@/components/fab-placement";
import { Plus } from "@/components/icons";
import { ScreenFab } from "@/components/screen-fab";
import { layout } from "@/constants/theme";
import { AddBlogSheet } from "@/features/blogs/components/add-blog-sheet";
import { ArticleSheets } from "@/features/blogs/components/article-sheets";
import { BlogsHome } from "@/features/blogs/components/blogs-home";
import { BlogsHomeSkeleton } from "@/features/blogs/components/blogs-home-skeleton";
import { BlogsWelcome } from "@/features/blogs/components/blogs-welcome";
import { useLibraryFilled } from "@/features/library/hooks/use-library-filled";
import { useBlogsPage } from "@/features/blogs/hooks/use-blogs-page";
import { useSettledAfter } from "@/navigation/use-settled-after";

type BlogsPageProps = {
  /** Room kept free at the bottom for the mini player, when one is showing. */
  bottomChrome: number;
  /** How long to hold the shelves for the switch's fade; zero when the app opened here. */
  settleMs: number;
};

/** The blogs side of the Library, wired: the welcome before anything is followed, the shelves after. */
export function BlogsPage({ bottomChrome, settleMs }: BlogsPageProps) {
  const insets = useSafeAreaInsets();
  const page = useBlogsPage();
  // After the Library switch's fade (250ms), so the shelves do not mount
  // under a moving surface. At once when the app opened on this side.
  const landed = useSettledAfter(settleMs);
  useLibraryFilled(page.view !== "loading");
  const { articles, addBlog, importer } = page;
  const stagePadding = bottomChrome + insets.bottom + layout.gutter;

  if (page.view === "welcome") {
    return (
      <>
        <BlogsWelcome
          bottomPadding={stagePadding}
          onExplore={page.openExplore}
          onAddByAddress={() => addBlog.open()}
          importing={importer.importing}
          onImport={importer.start}
        />
        <AddBlogSheet {...addBlog.sheet} />
      </>
    );
  }

  return (
    <View className="flex-1">
      {/* The side's shape at once while the library is read; then the Continue
          card with the side, and the shelves once the switch has finished moving. */}
      {page.view === "home" ? (
        <BlogsHome
          landed={landed}
          home={page.home}
          refreshing={page.pulling}
          bottomPadding={bottomChrome + fabClearance(insets.bottom)}
          onRefresh={page.refresh}
          onViewAll={page.viewAll}
          onOpenArticle={articles.openArticle}
          onOpenBlog={articles.openBlog}
          onArticleMenu={articles.openMenu}
        />
      ) : (
        <BlogsHomeSkeleton hero={page.leadsWithContinue} />
      )}
      {/* The side's one creative action, the same floating button the other
          sides give theirs: find something new to read. */}
      <ScreenFab icon={Plus} accessibilityLabel="Find blogs" onPress={page.openExplore} />
      <ArticleSheets actions={articles} />
      <AddBlogSheet {...addBlog.sheet} />
    </View>
  );
}
