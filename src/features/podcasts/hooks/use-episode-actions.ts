import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Share } from 'react-native';

import { showToast } from '@/components/toast/toast-provider';
import { downloadWithToast } from '@/features/podcasts/hooks/download-with-toast';
import { openEpisodePage, openShowPage } from '@/features/podcasts/hooks/open-podcast-page';
import type { EpisodeAction } from '@/features/podcasts/utils/episode-menu';
import * as actions from '@/services/podcasts/actions';
import { playEpisode, toggleEpisode } from '@/services/podcasts/player';
import type { EpisodeItem } from '@/services/podcasts/records';
import { selectEpisodeId, usePlayer } from '@/stores/player';

/**
 * Playing an episode from anywhere: its own play control pauses it when it
 * is the one playing, and starts it (from where it was left) otherwise.
 */
export function playOrToggle(episodeId: string): void {
  if (selectEpisodeId(usePlayer.getState()) === episodeId) void toggleEpisode();
  else void playEpisode(episodeId);
}

/**
 * The episode menu's state and what each of its rows does, for any screen
 * that lists episodes. One implementation, so "Play next" on a shelf and
 * "Play next" on a show's page cannot come to mean different things.
 */
export function useEpisodeActions({ onHighlights }: { onHighlights?: () => void } = {}) {
  const router = useRouter();
  const [menuEpisode, setMenuEpisode] = React.useState<EpisodeItem | null>(null);

  const openEpisode = React.useCallback((episodeId: string) => openEpisodePage(router, episodeId), [router]);
  const openShow = React.useCallback((showId: string) => openShowPage(router, showId), [router]);
  const openMenu = React.useCallback((episode: EpisodeItem) => setMenuEpisode(episode), []);
  const closeMenu = React.useCallback(() => setMenuEpisode(null), []);
  const play = React.useCallback((episodeId: string) => playOrToggle(episodeId), []);

  const onAction = React.useCallback(
    (action: EpisodeAction, episode: EpisodeItem) => {
      const ids = [episode.id];
      switch (action) {
        case 'play': {
          // Resume, never restart: the one already in the player just carries on.
          const player = usePlayer.getState();
          if (selectEpisodeId(player) !== episode.id) void playEpisode(episode.id);
          else if (!player.isPlaying) void toggleEpisode();
          return;
        }
        case 'play-next':
          void actions.addToQueue(ids, 'next');
          showToast({ message: 'Plays next' });
          return;
        case 'queue-last':
          void actions.addToQueue(ids, 'last');
          showToast({ message: episode.queuePosition == null ? 'Added to Up Next' : 'Moved to the end of Up Next' });
          return;
        case 'dequeue':
          void actions.removeFromQueue(ids);
          return;
        case 'download':
          downloadWithToast(episode);
          return;
        case 'remove-download':
          void actions.removeDownload(ids);
          return;
        case 'favorite':
          void actions.setFavorite(ids, true);
          showToast({ message: 'Added to Favorites', tone: 'success' });
          return;
        case 'unfavorite':
          void actions.setFavorite(ids, false);
          return;
        case 'played':
          void actions.markPlayed(ids, true);
          return;
        case 'unplayed':
          void actions.markPlayed(ids, false);
          return;
        case 'seen':
          void actions.markSeen(ids);
          return;
        case 'reset':
          void actions.resetPosition(ids);
          return;
        case 'share':
          void Share.share({ message: `${episode.title}\n${episode.link ?? episode.audioUrl}` }).catch(() => {});
          return;
        case 'website':
          if (episode.link) void WebBrowser.openBrowserAsync(episode.link).catch(() => {});
          return;
        case 'show':
          openShow(episode.podcastId);
          return;
        case 'highlights':
          onHighlights?.();
          return;
      }
    },
    [onHighlights, openShow],
  );

  const currentId = usePlayer(selectEpisodeId);

  return {
    menuEpisode,
    openMenu,
    closeMenu,
    onAction,
    play,
    openEpisode,
    openShow,
    /** Spread onto `EpisodeActionSheet`. */
    sheet: {
      visible: menuEpisode !== null,
      episode: menuEpisode,
      isCurrent: menuEpisode !== null && menuEpisode.id === currentId,
      highlights: onHighlights !== undefined,
      onClose: closeMenu,
      onAction,
    },
  };
}
