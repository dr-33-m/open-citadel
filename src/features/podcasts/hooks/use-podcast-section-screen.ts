import { useRouter } from 'expo-router';
import React from 'react';

import { usePodcastSection } from '@/features/podcasts/hooks/use-podcast-section';
import { useDragOrder, type DragMove } from '@/hooks/use-drag-order';
import { usePageSearch, useSearchResults } from '@/hooks/use-page-search';
import { tileFromShow } from '@/features/podcasts/utils/show-tiles';
import { isPodcastSection, SECTION_TITLES, type PodcastSection } from '@/features/podcasts/utils/sections';
import * as actions from '@/services/podcasts/actions';
import { showName, type EpisodeItem, type ShowItem } from '@/services/podcasts/records';
import { countLabel, formatBytes } from '@/utils/format';

/** What the page draws under its search. */
export type PodcastSectionView = 'shows' | 'queue' | 'episodes';

const episodeKey = (episode: EpisodeItem) => episode.id;
const saveMove = ({ id, to }: DragMove) => void actions.moveInQueue(id, to);
const episodeFields = (episode: EpisodeItem) => [episode.title, episode.showTitle];
const showFields = (show: ShowItem) => [showName(show), show.author];

/**
 * A podcast shelf's "View all": every episode (or show) on it, searchable,
 * with the count (and the size on disk, for Downloads) under the title and
 * the shelf's one bulk action. Up Next is put in order by dragging, except
 * while a search narrows it.
 */
export function usePodcastSectionScreen(type: string | undefined) {
  const router = useRouter();
  const section: PodcastSection = isPodcastSection(type) ? type : 'queue';
  const { episodes, shows, bytes, loaded } = usePodcastSection(section);
  const search = usePageSearch();

  const filteredEpisodes = useSearchResults(episodes, search, episodeFields);
  const foundShows = useSearchResults(shows, search, showFields);
  const filteredShows = React.useMemo(() => foundShows.map(tileFromShow), [foundShows]);

  const queue = useDragOrder(filteredEpisodes, episodeKey, saveMove);

  const isShows = section === 'shows';
  const view: PodcastSectionView = isShows ? 'shows' : section === 'queue' ? 'queue' : 'episodes';
  const count = isShows ? countLabel(shows.length, 'SHOW') : countLabel(episodes.length, 'EPISODE');
  const size = section === 'downloads' ? formatBytes(bytes) : '';
  const close = React.useCallback(() => router.back(), [router]);
  const markAllSeen = React.useCallback(() => void actions.markSeen('all'), []);
  const clearQueue = React.useCallback(() => void actions.clearQueue(), []);

  return {
    title: SECTION_TITLES[section],
    subtitle: size ? `${count} · ${size}` : count,
    view,
    isShows,
    loaded,
    episodes: filteredEpisodes,
    /** Up Next as the drag list draws it. */
    queue: { data: queue.items, onReorder: queue.onReorder, dragEnabled: !search.query.trim() },
    shows: filteredShows,
    search,
    canSearch: (isShows ? shows.length : episodes.length) > 0,
    emptyText: search.query ? 'No results.' : 'Nothing here yet.',
    close,
    /** Just Arrived can all be marked seen at once, Up Next cleared; only when there is something to act on. */
    markAllSeen: section === 'inbox' && episodes.length > 0 ? markAllSeen : null,
    clearQueue: section === 'queue' && episodes.length > 0 ? clearQueue : null,
  };
}
