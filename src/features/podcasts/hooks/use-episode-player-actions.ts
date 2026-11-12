import { useRouter } from 'expo-router';

import { openShowPage } from '@/features/podcasts/hooks/open-podcast-page';
import * as actions from '@/services/podcasts/actions';
import { playEpisode } from '@/services/podcasts/player';
import type { EpisodeNowPlaying } from '@/stores/player';
import type { EpisodeItem } from '@/services/podcasts/records';

/** What only an episode's player does: its favourite, its show, and Up Next. */
export function useEpisodePlayerActions(current: EpisodeNowPlaying | null, episode: EpisodeItem | null, closeSheet: () => void) {
  const router = useRouter();
  const favorite = episode?.isFavorite === 1;
  return {
    favorite,
    openShow: () => current && openShowPage(router, current.podcastId),
    toggleFavorite: () => current && void actions.setFavorite([current.episodeId], !favorite),
    upNext: {
      play: (id: string) => {
        closeSheet();
        void playEpisode(id);
      },
      move: (id: string, index: number) => void actions.moveInQueue(id, index),
      remove: (id: string) => void actions.removeFromQueue([id]),
      clear: () => void actions.clearQueue(),
    },
  };
}

export type EpisodePlayerActions = ReturnType<typeof useEpisodePlayerActions>;
