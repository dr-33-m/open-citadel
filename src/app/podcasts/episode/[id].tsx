import { useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronLeft, Share } from "@/components/icons";
import { Handover } from "@/components/navigation/handover";
import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScreenHeader } from "@/components/ui/screen-header";
import { contentColumn, iconSize, layout } from "@/constants/theme";
import { EpisodeDetails } from "@/features/podcasts/components/episode-details";
import { EpisodeDetailsSkeleton } from "@/features/podcasts/components/episode-details-skeleton";
import { EpisodeHero } from "@/features/podcasts/components/episode-hero";
import { EpisodeHighlightsSheet } from "@/features/podcasts/components/episode-highlights-sheet";
import { EpisodeTranscriptBar } from "@/features/podcasts/components/episode-transcript-bar";
import { EpisodePageSkeleton } from "@/features/podcasts/components/episode-page-skeleton";
import { MiniPlayer } from "@/features/podcasts/components/mini-player";
import { useEpisodeScreen } from "@/features/podcasts/hooks/use-episode-screen";
import { useMiniPlayer } from "@/features/podcasts/hooks/use-mini-player";
import { useThemeTokens } from "@/hooks/use-theme-tokens";
import { useSettledOnce } from "@/navigation/use-settled-once";

/**
 * An episode: its hero and actions, its chapters, and its show notes.
 *
 * The hero is plain views over data read ahead at the tap, so it is drawn
 * from the first frame and the page looks finished while it is still moving.
 * Only the chapters and notes wait for the slide to land, behind a skeleton
 * of their shape: the notes can run to a few thousand words, and setting
 * them mid-slide froze the transition partway.
 */
export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  const landed = useSettledOnce();
  const screen = useEpisodeScreen(id, landed);
  const miniPlayer = useMiniPlayer(insets.bottom);
  const { episode, hero } = screen;

  const page = episode ? (
    <PageFade>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-8 px-6 pt-2"
        contentContainerStyle={{ paddingBottom: layout.scrollBottom + insets.bottom + miniPlayer.clearance }}
        showsVerticalScrollIndicator={false}
      >
        <View style={contentColumn}>
          <EpisodeHero
            episode={episode}
            showTitle={screen.showTitle}
            artworkUrl={screen.artworkUrl}
            playback={screen.playback}
            onPlay={hero.play}
            onOpenShow={hero.openShow}
            onToggleQueue={hero.toggleQueue}
            onDownload={hero.download}
            onRemoveDownload={hero.removeDownload}
            onToggleFavorite={hero.toggleFavorite}
            onTogglePlayed={hero.togglePlayed}
            transcript={
              <EpisodeTranscriptBar episode={episode} line={screen.transcriptLine} live={landed} highlights={screen.highlightsBox} />
            }
          />
        </View>
        {screen.hasDetails ? (
          <Handover fill={false} ready={landed} skeleton={<EpisodeDetailsSkeleton />}>
            <EpisodeDetails
              chapters={screen.chapters}
              notes={screen.notes}
              onSeek={screen.playFrom}
              onLink={screen.openLink}
            />
          </Handover>
        ) : null}
      </ScrollView>
    </PageFade>
  ) : null;
  const gone = (
    <View className="flex-1 items-center justify-center px-10">
      <ThemedText type="bodyMd" color={tokens["--color-muted-foreground"]}>
        This episode is no longer here.
      </ThemedText>
    </View>
  );
  const body = { loading: <EpisodePageSkeleton />, episode: page, gone }[screen.view];

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title=""
        leftIcon={<ChevronLeft size={iconSize.default} color={tokens["--color-foreground"]} />}
        leftLabel="Back"
        onLeftPress={screen.back}
        rightIcon={screen.share ? <Share size={18} color={tokens["--color-foreground"]} /> : undefined}
        rightLabel="Share"
        onRightPress={screen.share ?? undefined}
      />
      {body}
      {miniPlayer.props ? <MiniPlayer {...miniPlayer.props} /> : null}
      {landed ? <EpisodeHighlightsSheet highlights={screen.highlights} /> : null}
    </ThemedView>
  );
}
