import { useQuery } from '@tanstack/react-query';

import { useCurrentChapter } from '@/features/podcasts/hooks/use-current-chapter';
import { usePlayerState } from '@/features/podcasts/hooks/use-player-state';
import {
  createChaptersQueryOptions,
  createEpisodeItemQueryOptions,
  createPodcastSectionQueryOptions,
  createShowQueryOptions,
  type Chapter,
} from '@/query-manager/podcasts';
import type { EpisodeItem } from '@/services/podcasts/records';
import { selectEpisode, usePlayer } from '@/stores/player';

const NO_EPISODES: EpisodeItem[] = [];
const NO_CHAPTERS: Chapter[] = [];

/**
 * Everything the full player draws for an episode, gathered in one place: the
 * player's own state (`usePlayerState`), the episode as stored (for its
 * favourite), its show (for a speed of its own), its chapters and which one
 * is playing, and Up Next. Nothing here renders on a clock: only when
 * something it shows changes.
 *
 * `landed` is false while the player is still opening. What is already in the
 * cache is drawn from the first frame (the mini player reads these ahead, see
 * `useMiniPlayer`), but nothing is fetched and the native player is not asked
 * anything until the screen has stopped moving: each answer rendered the whole
 * player again in the middle of its own opening, which is what made it stutter.
 */
export function usePlayerScreen(landed: boolean) {
  const current = usePlayer(selectEpisode);
  const state = usePlayerState(landed);
  const episodeId = current?.episodeId ?? null;
  const podcastId = current?.podcastId ?? null;

  // The same cache entries the episode page, Up Next's "View all" and the
  // show page read, so opening the player after any of them costs nothing.
  const episode =
    useQuery(createEpisodeItemQueryOptions(episodeId ?? '', { enabled: landed && episodeId !== null })).data ?? null;
  const queue = useQuery(createPodcastSectionQueryOptions('queue', { enabled: landed })).data?.episodes ?? NO_EPISODES;
  const show = useQuery(createShowQueryOptions(podcastId ?? '', { enabled: landed && podcastId !== null })).data ?? null;
  const chapters =
    useQuery(createChaptersQueryOptions(episodeId ?? '', { enabled: landed && episodeId !== null })).data ?? NO_CHAPTERS;
  const showOverride = show?.playbackSpeed != null ? show.customTitle || show.title : null;
  const currentChapter = useCurrentChapter(chapters, current?.positionSec ?? 0, landed);

  return {
    ...state,
    current,
    episode,
    speedLine: showOverride
      ? `Applies to ${showOverride}, which has a speed of its own.`
      : 'Applies to every show without a speed of its own.',
    queue,
    chapters,
    currentChapter,
  };
}
