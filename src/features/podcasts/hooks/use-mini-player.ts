import { useRouter } from 'expo-router';
import React from 'react';

import { useHighlightNow } from '@/features/audiobook/hooks/use-highlight-now';
import { MINI_PLAYER_CLEARANCE, type MiniPlayerProps } from '@/features/podcasts/components/mini-player';
import { miniPlayerItem } from '@/features/podcasts/utils/mini-player-item';
import { queryClient } from '@/lib/query-client';
import {
  createChaptersQueryOptions,
  createEpisodeItemQueryOptions,
  createPodcastSectionQueryOptions,
  createShowQueryOptions,
} from '@/query-manager/podcasts';
import { skipBy, stopPlayback, togglePlayback } from '@/services/player';
import { selectSentenceHighlighted, useAudiobook } from '@/stores/audiobook';
import { selectEpisode, selectPlaying, usePlayerLoader, usePlayer } from '@/stores/player';
import { usePodcastPrefs } from '@/stores/podcast-prefs';

/**
 * Reads what the full player shows beyond the card (the episode as stored, its
 * show, its chapters, Up Next) while the card is on screen, so the player
 * opens complete from its first frame: it fetches nothing while it is opening
 * (see `usePlayerScreen`), and what was not in the cache by then would only
 * appear once it had landed. Already cached and unchanged, this does nothing.
 */
function warmPlayer(episodeId: string, podcastId: string): void {
  void queryClient.prefetchQuery(createEpisodeItemQueryOptions(episodeId));
  void queryClient.prefetchQuery(createShowQueryOptions(podcastId));
  void queryClient.prefetchQuery(createChaptersQueryOptions(episodeId));
  void queryClient.prefetchQuery(createPodcastSectionQueryOptions('queue'));
}

/**
 * Everything the mini player needs, or null when nothing is in the player.
 * Also says how much room to keep free under a screen's content for it.
 */
export function useMiniPlayer(bottomInset: number): { props: MiniPlayerProps | null; clearance: number } {
  const router = useRouter();
  const nowPlaying = usePlayer((s) => s.current);
  // Playing or about to be: set on the press, so the icon answers at once. The
  // loader only for a wait long enough to notice.
  const isPlaying = usePlayer(selectPlaying);
  const isBuffering = usePlayerLoader();
  const skipForwardSec = usePodcastPrefs((s) => s.skipForwardSec);
  // Already playing when this screen opened: the card came with the screen,
  // so it is simply there. Once it has gone, the next one arrives.
  const [cameWithScreen, setCameWithScreen] = React.useState(nowPlaying !== null);
  if (cameWithScreen && !nowPlaying) setCameWithScreen(false);

  const highlighted = useAudiobook(selectSentenceHighlighted);
  const onHighlight = useHighlightNow();
  const item = React.useMemo(() => (nowPlaying ? miniPlayerItem(nowPlaying) : null), [nowPlaying]);
  const episode = usePlayer(selectEpisode);
  const episodeId = episode?.episodeId ?? null;
  const podcastId = episode?.podcastId ?? null;
  React.useEffect(() => {
    if (episodeId && podcastId) warmPlayer(episodeId, podcastId);
  }, [episodeId, podcastId]);

  const onOpen = React.useCallback(() => router.push('/podcasts/player'), [router]);
  const onToggle = React.useCallback(() => void togglePlayback(), []);
  const onSkipForward = React.useCallback(() => skipBy(skipForwardSec), [skipForwardSec]);
  const onClose = React.useCallback(() => void stopPlayback(), []);

  if (!item) return { props: null, clearance: 0 };
  return {
    props: {
      item,
      isPlaying,
      isBuffering,
      skipForwardSec,
      highlighted,
      onHighlight: () => void onHighlight(),
      bottomInset,
      arrives: !cameWithScreen,
      onOpen,
      onToggle,
      onSkipForward,
      onClose,
    },
    clearance: MINI_PLAYER_CLEARANCE,
  };
}

/**
 * The mini player's room, whether or not this screen draws it: the full
 * clearance while anything is in the player, nothing otherwise. For what has
 * to sit in the same place on every screen, like the floating buttons.
 */
export function useMiniPlayerClearance(): number {
  return usePlayer((s) => (s.current ? MINI_PLAYER_CLEARANCE : 0));
}
