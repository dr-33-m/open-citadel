import { useLocalSearchParams } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DragList } from "@/components/drag-list";
import { DrawerHeader } from "@/components/drawer-header";
import { IconButton } from "@/components/icon-button";
import { CheckCheck, Trash2 } from "@/components/icons";
import { ListEmpty } from "@/components/list-empty";
import { Handover } from "@/components/navigation/handover";
import { TransitionFlashList } from "@/components/navigation/transition-scroll";
import { PageFade } from "@/components/scroll-fades";
import { ThemedView } from "@/components/themed-view";
import { LIST_DRAW_DISTANCE, layout } from "@/constants/theme";
import { EpisodeActionSheet } from "@/features/podcasts/components/episode-action-sheet";
import { EpisodeListSkeleton } from "@/features/podcasts/components/episode-list-skeleton";
import { RowSeparator } from "@/components/row-separator";
import { MiniPlayer } from "@/features/podcasts/components/mini-player";
import { ShowGrid } from "@/features/podcasts/components/show-grid";
import { TileGridSkeleton } from "@/components/skeletons/tile-grid-skeleton";
import { useEpisodeActions } from "@/features/podcasts/hooks/use-episode-actions";
import { useEpisodeRowRenderer } from "@/features/podcasts/hooks/use-episode-row-renderer";
import { useMiniPlayer } from "@/features/podcasts/hooks/use-mini-player";
import { usePodcastSectionScreen } from "@/features/podcasts/hooks/use-podcast-section-screen";
import { useThemeTokens } from "@/hooks/use-theme-tokens";
import { useSettledOnce } from "@/navigation/use-settled-once";
import type { EpisodeItem } from "@/services/podcasts/records";

const episodeKey = (item: EpisodeItem) => item.id;

/** A podcast shelf's "View all": every episode (or show) on it, searchable; Up Next in the order it is dragged into. */
export default function PodcastSectionScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  const landed = useSettledOnce();
  const screen = usePodcastSectionScreen(type);
  const episodeActions = useEpisodeActions();
  const renderEpisode = useEpisodeRowRenderer(episodeActions, { withShow: true });
  const miniPlayer = useMiniPlayer(insets.bottom);
  const bottomPadding = layout.scrollBottom + insets.bottom + miniPlayer.clearance;
  const empty = <ListEmpty text={screen.emptyText} />;
  const skeleton = screen.isShows ? <TileGridSkeleton label="Loading shows" /> : <EpisodeListSkeleton />;
  const listStyle = React.useMemo(() => ({ paddingBottom: bottomPadding }), [bottomPadding]);
  const lists = {
    shows: <ShowGrid tiles={screen.shows} empty={empty} bottomPadding={bottomPadding} onOpen={episodeActions.openShow} />,
    queue: (
      <DragList
        {...screen.queue}
        host="page"
        keyExtractor={episodeKey}
        renderItem={renderEpisode}
        ItemSeparatorComponent={RowSeparator}
        contentContainerStyle={listStyle}
        ListEmptyComponent={empty}
      />
    ),
    episodes: (
      <TransitionFlashList
        data={screen.episodes}
        keyExtractor={episodeKey}
        renderItem={renderEpisode}
        ItemSeparatorComponent={RowSeparator}
        drawDistance={LIST_DRAW_DISTANCE}
        contentContainerStyle={listStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={empty}
      />
    ),
  };

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <DrawerHeader
        title={screen.title}
        subtitle={screen.subtitle}
        onClose={screen.close}
        search={screen.search}
        searchLabel="Search by title or show"
        canSearch={screen.canSearch}
      >
        {screen.markAllSeen ? (
          <IconButton onPress={screen.markAllSeen} label="Clear everything from Just Arrived">
            <CheckCheck size={16} color={tokens["--color-primary"]} strokeWidth={2} />
          </IconButton>
        ) : null}
        {screen.clearQueue ? (
          <IconButton onPress={screen.clearQueue} label="Clear Up Next">
            <Trash2 size={16} color={tokens["--color-muted-foreground"]} strokeWidth={2} />
          </IconButton>
        ) : null}
      </DrawerHeader>
      {/* The list mounts once the drawer has landed and the shelf has been
          read, behind a skeleton of its shape. */}
      <Handover ready={landed && screen.loaded} skeleton={skeleton}>
        <PageFade>{lists[screen.view]}</PageFade>
      </Handover>
      {miniPlayer.props ? <MiniPlayer {...miniPlayer.props} /> : null}
      {landed ? (
        <EpisodeActionSheet {...episodeActions.sheet} />
      ) : null}
    </ThemedView>
  );
}
