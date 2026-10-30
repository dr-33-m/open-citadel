import { useRouter, type ImperativeRouter } from 'expo-router';
import React from 'react';

import { useAntennaPodImport } from '@/features/podcasts/hooks/use-antennapod-import';
import { useExploreCharts, useExploreSearch, useFollowedCheck } from '@/features/podcasts/hooks/use-explore';
import { usePageSearch } from '@/hooks/use-page-search';
import { looksLikeLink } from '@/features/podcasts/utils/links';
import { discoveredKey } from '@/features/podcasts/utils/show-tiles';
import { prefetchDiscoveredShow } from '@/services/podcasts/actions';
import { appleIdFromLink, type DiscoveredShow, type ExploreGenre } from '@/services/podcasts/discovery';
import { normalizeFeedUrl } from '@/services/feeds/fetch';

/** A genre in a route: its Apple id, or `all` for the overall chart. */
export const genreParam = (id: number | null) => (id == null ? 'all' : String(id));

export type OpenableShow = Pick<DiscoveredShow, 'appleId' | 'feedUrl' | 'title' | 'author' | 'artworkUrl'>;

/** What Explore shows under its search field. */
export type ExploreView = 'import' | 'link' | 'search' | 'charts';

/** A show page's params for a show Explore found: only what is known, so the route never carries "null". */
export function discoverParams(show: OpenableShow) {
  const params: { id: string; title: string; appleId?: string; feedUrl?: string; author?: string; artworkUrl?: string } = {
    id: 'discover',
    title: show.title,
  };
  if (show.appleId) params.appleId = show.appleId;
  if (show.feedUrl) params.feedUrl = show.feedUrl;
  if (show.author) params.author = show.author;
  if (show.artworkUrl) params.artworkUrl = show.artworkUrl;
  return params;
}

/**
 * Opens a show Explore found. Its feed starts downloading at the tap, and is
 * stored behind the hero once the page has landed.
 */
export function openDiscoveredShowPage(router: ImperativeRouter, show: OpenableShow): void {
  prefetchDiscoveredShow(show);
  router.push({ pathname: '/podcasts/show/[id]', params: discoverParams(show) });
}

/**
 * Explore's state: the charts, a search as typing pauses, a pasted link, the
 * import at its foot, and opening any show found.
 */
export function useExploreScreen(settled: boolean) {
  const router = useRouter();
  const page = usePageSearch();
  // An emptied field is the charts again at once, not after the pause.
  const query = page.query.trim() ? page.term : '';
  const charts = useExploreCharts(settled);
  const search = useExploreSearch(query);
  const isFollowed = useFollowedCheck();
  const importer = useAntennaPodImport();

  /** Straight to the show's page; its feed is stored there, behind the hero. */
  const openShow = React.useCallback((show: OpenableShow) => openDiscoveredShowPage(router, show), [router]);
  const openLink = React.useCallback(() => {
    const appleId = appleIdFromLink(query);
    openShow({ appleId, feedUrl: appleId ? null : normalizeFeedUrl(query), title: '', author: null, artworkUrl: null });
  }, [openShow, query]);

  // The shelf and its "View all" share one cached chart, so this opens full.
  const openGenre = React.useCallback(
    (genre: ExploreGenre) =>
      router.push({ pathname: '/podcasts/genre/[id]', params: { id: genreParam(genre.id) } }),
    [router],
  );

  const results = React.useMemo(() => (search.status === 'ready' ? search.shows : []), [search]);
  const resultsById = React.useMemo(() => new Map(results.map((s) => [discoveredKey(s), s])), [results]);
  const openResult = React.useCallback(
    (id: string) => {
      const show = resultsById.get(id);
      if (show) openShow(show);
    },
    [openShow, resultsById],
  );

  const term = query.trim();
  const view: ExploreView =
    importer.active ? 'import' : term && looksLikeLink(term) ? 'link' : term ? 'search' : 'charts';
  const searchEmptyText =
    search.status === 'failed'
      ? 'Search did not go through. Check your connection.'
      : search.status === 'ready'
        ? `No shows found for “${term}”.`
        : null;

  return {
    view,
    term,
    // An import has the page to itself: searching mid-import would only hide what it is doing.
    search: { ...page, searching: page.searching && !importer.active },
    canSearch: !importer.active,
    finding: search.status === 'loading',
    charts,
    results,
    searchEmptyText,
    isFollowed,
    importer,
    openShow,
    openLink,
    openResult,
    openGenre,
    close: () => router.back(),
  };
}
