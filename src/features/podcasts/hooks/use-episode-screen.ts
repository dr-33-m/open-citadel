import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Share } from 'react-native';

import { openShowPage } from '@/features/podcasts/hooks/open-podcast-page';
import { useEpisode } from '@/features/podcasts/hooks/use-episode';
import { playOrToggle } from '@/features/podcasts/hooks/use-episode-actions';
import { useEpisodeHighlights } from '@/features/podcasts/hooks/use-episode-highlights';
import { formatDuration } from '@/features/podcasts/utils/format';
import * as actions from '@/services/podcasts/actions';
import { localCoverUri } from '@/services/podcasts/download-paths';
import { playEpisodeFrom } from '@/services/podcasts/player';
import { showName } from '@/services/podcasts/records';
import { useEpisodePlayback } from '@/stores/player';

/** What an episode's page draws: its skeleton, the episode, or word that it is gone. */
export type EpisodeView = 'loading' | 'episode' | 'gone';

/**
 * An episode's page: the episode, its show, chapters and parsed notes, and
 * everything its controls do.
 */
export function useEpisodeScreen(id: string, landed: boolean) {
  const router = useRouter();
  const { detail, listed, chapters, notes, loaded } = useEpisode(id, landed);
  const playback = useEpisodePlayback(id);
  // Drawn from the list's row until the page's own read lands; after that the
  // read is the truth, gone included.
  const episode = loaded ? (detail?.episode ?? null) : listed;
  const show = detail?.show ?? null;
  const link = episode?.link ?? show?.link ?? null;

  /** A timestamp or chapter: play from there (`playEpisodeFrom`). */
  const playFrom = React.useCallback((seconds: number) => void playEpisodeFrom(id, seconds), [id]);
  // Web links in the in-app browser; mail links to the mail app, which the
  // browser cannot open.
  const openLink = React.useCallback((url: string) => {
    if (/^mailto:/i.test(url)) void Linking.openURL(url).catch(() => {});
    else void WebBrowser.openBrowserAsync(url).catch(() => {});
  }, []);

  const back = React.useCallback(() => router.back(), [router]);
  const hero = {
    play: () => playOrToggle(id),
    openShow: () => episode && openShowPage(router, episode.podcastId),
    toggleQueue: () =>
      void (episode?.queuePosition == null ? actions.addToQueue([id], 'last') : actions.removeFromQueue([id])),
    download: () => void actions.download([id]),
    removeDownload: () => void actions.removeDownload([id]),
    toggleFavorite: () => void actions.setFavorite([id], !episode?.isFavorite),
    togglePlayed: () => void actions.markPlayed([id], episode?.playState !== 'played'),
  };

  const view: EpisodeView = episode ? 'episode' : loaded ? 'gone' : 'loading';
  const showTitle = show ? showName(show) : (listed?.showTitle ?? '');
  // The same picture either way, so the cover is not asked for twice. The
  // copy saved with a download comes first, as it does in every list.
  const artworkUrl =
    (episode ? localCoverUri(episode) : null) ?? episode?.imageUrl ?? show?.imageUrl ?? listed?.showImageUrl ?? null;
  const highlights = useEpisodeHighlights({ episodeId: episode ? id : null, title: episode?.title ?? '' });

  return {
    view,
    episode,
    showTitle,
    /** Under the transcript's title: "The Show · 1 hr 30 min". */
    transcriptLine: [showTitle, formatDuration(episode?.durationSec ?? 0)].filter(Boolean).join(' · '),
    artworkUrl,
    playback,
    chapters,
    notes,
    /** Whether there is anything under the hero: chapters or notes. Assumed until the read says. */
    hasDetails: !loaded || chapters.length > 0 || notes.length > 0,
    playFrom,
    openLink,
    hero,
    highlights,
    /** The Highlights box under the transcript's, once the episode has any. */
    highlightsBox: highlights.count > 0 ? { label: highlights.label, onOpen: highlights.open } : null,
    back,
    /** Sharing needs somewhere to send people: the episode's page, or the show's. */
    share: link && episode ? () => void Share.share({ message: `${episode.title}\n${link}` }).catch(() => {}) : null,
  };
}
