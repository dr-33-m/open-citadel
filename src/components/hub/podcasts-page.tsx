import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Plus } from "@/components/icons";
import { fabClearance } from "@/components/fab-placement";
import { ScreenFab } from "@/components/screen-fab";
import { layout } from "@/constants/theme";
import { EpisodeActionSheet } from "@/features/podcasts/components/episode-action-sheet";
import { PodcastsHomeSkeleton } from "@/features/podcasts/components/podcasts-home-skeleton";
import { PodcastsHome } from "@/features/podcasts/components/podcasts-home";
import { ImportGuideSheet } from "@/features/podcasts/components/onboarding/import-guide-sheet";
import { ImportView } from "@/features/podcasts/components/onboarding/import-view";
import { PodcastsWelcome } from "@/features/podcasts/components/onboarding/podcasts-welcome";
import { useLibraryFilled } from "@/features/library/hooks/use-library-filled";
import { usePodcastsPage } from "@/features/podcasts/hooks/use-podcasts-page";
import { useSettledAfter } from "@/navigation/use-settled-after";

type PodcastsPageProps = {
  /** Room kept free at the bottom for the mini player, when one is showing. */
  bottomChrome: number;
  /** How long to hold the shelves for the switch's fade; zero when the app opened here. */
  settleMs: number;
};

/** The podcasts side of the Library, wired: the welcome the first time, an import while one runs, the shelves after. */
export function PodcastsPage({ bottomChrome, settleMs }: PodcastsPageProps) {
  const insets = useSafeAreaInsets();
  // After the Library switch's fade (250ms) has run, so the shelves do not
  // mount under a moving surface. At once when the app opened on this side.
  const landed = useSettledAfter(settleMs);
  const page = usePodcastsPage(landed);
  useLibraryFilled(page.view !== "loading");
  const { importer, episodes } = page;

  // Getting started keeps clear of whatever floats at the bottom, by the
  // same gutter the rest of the page keeps from its edges.
  const stagePadding = bottomChrome + insets.bottom + layout.gutter;

  if (importer.active) {
    return (
      <ImportView
        state={importer.active}
        bottomPadding={stagePadding}
        onDone={importer.reset}
        onRetry={importer.start}
        onCancel={importer.reset}
      />
    );
  }
  if (page.view === "welcome") {
    return (
      <>
        <PodcastsWelcome bottomPadding={stagePadding} onStartFresh={page.startFresh} onImport={importer.openGuide} />
        <ImportGuideSheet {...importer.guide} />
      </>
    );
  }

  return (
    <View className="flex-1">
      {/* The side's shape at once while the library is read; then the Continue
          card with the side, and the shelves once the switch has finished moving. */}
      {page.view === "home" ? (
        <PodcastsHome
          landed={landed}
          home={page.home}
          refreshing={page.pulling}
          bottomPadding={bottomChrome + fabClearance(insets.bottom)}
          onRefresh={page.refresh}
          onViewAll={page.viewAll}
          onOpenEpisode={episodes.openEpisode}
          onOpenShow={episodes.openShow}
          onEpisodeMenu={episodes.openMenu}
          onPlay={episodes.play}
        />
      ) : (
        <PodcastsHomeSkeleton hero={page.leadsWithContinue} />
      )}
      {/* The side's one creative action, the same floating button the books
          side and the Timeline give theirs: find something new to follow. */}
      <ScreenFab icon={Plus} accessibilityLabel="Add a podcast" onPress={page.openExplore} />
      <EpisodeActionSheet {...episodes.sheet} />
    </View>
  );
}
