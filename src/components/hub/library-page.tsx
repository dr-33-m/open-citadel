import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BlogsPage } from "@/components/hub/blogs-page";
import { BooksPage } from "@/components/hub/books-page";
import { LibraryHeader } from "@/components/hub/library-header";
import { LibrarySidePlaceholder } from "@/components/hub/library-side-placeholder";
import { PodcastsPage } from "@/components/hub/podcasts-page";
import { ThemeScope } from "@/components/theme-scope";
import { ViewSwitcher } from "@/components/view-switcher";
import { useLibraryPage } from "@/features/library/hooks/use-library-page";
import { LIBRARY_TAB_ORDER } from "@/features/library/components/library-tabs";
import { MiniPlayer } from "@/features/podcasts/components/mini-player";
import { useMiniPlayer } from "@/features/podcasts/hooks/use-mini-player";
import type { LibraryTab } from "@/stores/podcast-prefs";
import { librarySideOrder } from "@/utils/theme-order";

/**
 * The Library: books, podcasts and blogs, one header, one switch between them.
 *
 * The header is the hub's map, as it always was: the Timeline to one side,
 * Samwell to the other, drawn with their own icons. Its middle, which used to
 * say "Library", is now the switch that says which library this is. Each side
 * owns everything under the header, its own skeleton included, and is mounted
 * when it is first opened; this only decides which one is showing and keeps
 * the mini player above them.
 *
 * `themeOrder` is the Library's turn when the theme changes. The header, the
 * mini player and each side are theme scopes side by side, never one inside
 * another (`components/theme-scope`): the side showing changes with the
 * header, the other two after every page of the hub has.
 */
export function LibraryPage({ themeOrder }: { themeOrder: number }) {
  const insets = useSafeAreaInsets();
  const page = useLibraryPage();
  const miniPlayer = useMiniPlayer(insets.bottom);
  const chrome = miniPlayer.clearance;
  const { mounted, built, settleMs, tab } = page;
  // An opened side not built yet is drawn as its skeleton, so the switch
  // never fades onto an empty page. See `useLibraryPage`.
  const side = (key: LibraryTab, index: number, content: React.ReactNode) => {
    if (!mounted[key]) return null;
    const body = built[key] ? content : <LibrarySidePlaceholder side={key} />;
    return <ThemeScope order={librarySideOrder(index, tab === key, themeOrder)}>{body}</ThemeScope>;
  };
  const sides = {
    books: side("books", 0, <BooksPage bottomChrome={chrome} booted={page.booted} settleMs={settleMs.books} />),
    podcasts: side("podcasts", 1, <PodcastsPage bottomChrome={chrome} settleMs={settleMs.podcasts} />),
    blogs: side("blogs", 2, <BlogsPage bottomChrome={chrome} settleMs={settleMs.blogs} />),
  };

  return (
    <View className="flex-1" style={{ paddingTop: insets.top }}>
      <ThemeScope order={themeOrder}>
        <LibraryHeader
          tab={tab}
          onChangeTab={page.changeTab}
          onOpenTimeline={page.openTimeline}
          onOpenSamwell={page.openSamwell}
        />
      </ThemeScope>
      <ViewSwitcher order={LIBRARY_TAB_ORDER} value={tab} sides={sides} />
      {miniPlayer.props ? (
        <ThemeScope order={themeOrder}>
          <MiniPlayer {...miniPlayer.props} />
        </ThemeScope>
      ) : null}
    </View>
  );
}
