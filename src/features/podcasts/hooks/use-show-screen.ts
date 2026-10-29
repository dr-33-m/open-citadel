import React from 'react';

import { useShow, type ShowPreview } from '@/features/podcasts/hooks/use-show';
import { useShowMutations } from '@/features/podcasts/hooks/use-show-mutations';
import { usePageSearch, useSearchResults } from '@/hooks/use-page-search';
import * as actions from '@/services/podcasts/actions';
import type { ShowEpisodeFilter } from '@/services/podcasts/episodes';
import { showName, type EpisodeItem } from '@/services/podcasts/records';
import { playEpisode } from '@/services/podcasts/player';
import { showNotesToText } from '@/services/podcasts/show-notes';
import { countLabel } from '@/utils/format';

/** A show page's route params: a stored id, or `discover` with what Explore knew. */
export type ShowParams = {
  id: string;
  appleId?: string;
  feedUrl?: string;
  title?: string;
  author?: string;
  artworkUrl?: string;
};

const episodeFields = (e: EpisodeItem) => [e.title];

/**
 * Everything a show's page decides: which show (stored, or previewed from
 * Explore), its derived facts (name, plain description, newest episode, how
 * many are new), and following, leaving and refreshing it.
 */
export function useShowScreen(params: ShowParams, landed: boolean) {
  const [filter, setFilter] = React.useState<ShowEpisodeFilter>('all');
  const search = usePageSearch();

  const isDiscover = params.id === 'discover';
  const { appleId, feedUrl, title: previewTitle, author, artworkUrl } = params;
  const preview = React.useMemo<ShowPreview | null>(
    () =>
      isDiscover
        ? {
            appleId: appleId ?? null,
            feedUrl: feedUrl ?? null,
            title: previewTitle ?? '',
            author: author ?? null,
            artworkUrl: artworkUrl ?? null,
          }
        : null,
    [isDiscover, appleId, feedUrl, previewTitle, author, artworkUrl],
  );
  // A search looks through every episode, whichever filter the list was on.
  const data = useShow(isDiscover ? null : params.id, preview, search.searching ? 'all' : filter, landed);
  const { show, episodes, showId } = data;
  const results = useSearchResults(episodes, search, episodeFields);

  const title = show ? showName(show) : (preview?.title ?? '');
  const description = React.useMemo(() => showNotesToText(show?.description), [show?.description]);
  const newCount = React.useMemo(() => episodes.filter((e) => e.playState === 'new').length, [episodes]);
  const latest = React.useMemo(
    () => episodes.reduce<EpisodeItem | null>((a, e) => (!a || (e.pubDate ?? '') > (a.pubDate ?? '') ? e : a), null),
    [episodes],
  );

  const mutations = useShowMutations(showId, title);

  const playLatest = React.useCallback(() => latest && void playEpisode(latest.id), [latest]);
  const setSort = React.useCallback(
    (episodeSort: 'newest' | 'oldest') => show && void actions.updateShowSettings(show.id, { episodeSort }),
    [show],
  );
  const markAllSeen = React.useCallback(() => show && void actions.markShowSeen(show.id), [show]);

  const emptyText = !show
    ? null
    : search.query.trim()
      ? 'No episode titles match.'
      : filter === 'all' || search.searching
        ? 'This show has not published any episodes yet.'
        : 'No episodes match.';

  return {
    ...data,
    episodes: results,
    search,
    /** "12 EPISODES" over a search's results, in the hero's place. */
    resultsCount: countLabel(results.length, 'EPISODE'),
    /** Only a stored show has episodes to search, and only one not being searched is pulled for new ones. */
    canSearch: showId !== null,
    canRefresh: showId !== null && !search.searching,
    episodeCount: data.episodesLoaded ? episodes.length : null,
    filter,
    setFilter,
    setSort,
    markAllSeen,
    refreshing: mutations.refreshing,
    title,
    newCount,
    emptyText,
    hero: {
      title,
      author: show?.author ?? preview?.author ?? null,
      // The cover the page opened with stays for the page. A show from
      // Explore arrives with Apple's copy; once stored (after the page has
      // landed) it carries the feed's own, at another address, and switching
      // reloaded the cover from blank: a flash on every first visit.
      artworkUrl: preview?.artworkUrl ?? show?.imageUrl ?? null,
      description,
      following: show?.state === 'subscribed',
      loading: data.resolving,
      canFollow: showId !== null,
      refreshError: data.error ?? (show?.lastRefreshFailed ? show.lastRefreshError : null),
      // Held in place while the episodes are read, so the buttons do not
      // shuffle when they land; pressing it before then does nothing.
      canPlayLatest: latest !== null || !data.episodesLoaded,
    },
    follow: mutations.follow,
    unfollow: mutations.unfollow,
    refresh: mutations.refresh,
    playLatest,
  };
}
