import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';

import { useContinueHint } from '@/features/library/hooks/use-continue-hint';
import { useAntennaPodImport } from '@/features/podcasts/hooks/use-antennapod-import';
import { useEpisodeActions } from '@/features/podcasts/hooks/use-episode-actions';
import { openPodcastExplore } from '@/features/podcasts/hooks/open-podcast-page';
import { usePodcastHome } from '@/features/podcasts/hooks/use-podcast-home';
import type { PodcastSection } from '@/features/podcasts/utils/sections';
import { createPodcastSectionQueryOptions } from '@/query-manager/podcasts';
import { refreshAllShows } from '@/services/podcasts/refresh';
import { usePodcastPrefs } from '@/stores/podcast-prefs';

/** What the podcasts side draws: an import running, nothing for one frame, the welcome, or the shelves. */
export type PodcastsPageView = 'import' | 'loading' | 'welcome' | 'home';


/**
 * How long after the side has filled before its shows are checked. Checking a
 * show parses its whole feed on the JS thread (over a second for a long-running
 * show's), and started with the side it took the thread just as the shelves
 * were mounting: the side sat on its skeleton, and taps waited with it.
 */
const CHECK_AFTER_MS = 1500;

/**
 * The podcasts side of the Library: which view it shows, and what its
 * buttons, pull and shelves do.
 *
 * Opening it is also when followed shows are checked for new episodes (those
 * past the refresh interval only; a pull checks every one), which is the
 * moment the listener would look for them. `landed` is the side having
 * finished appearing: the check waits for that, and for the shelves.
 */
export function usePodcastsPage(landed: boolean) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const home = usePodcastHome();
  const leadsWithContinue = useContinueHint('podcasts', home.loaded ? home.shelves.continue.length > 0 : undefined);
  const importer = useAntennaPodImport();
  const episodes = useEpisodeActions();
  // A pull checks every show now, not only those past the interval. A mutation,
  // so its pending state is the spinner and a second pull joins the first.
  const pull = useMutation({ mutationFn: () => refreshAllShows(true) });

  const filled = landed && home.loaded;
  React.useEffect(() => {
    if (!filled) return undefined;
    const timer = setTimeout(() => void refreshAllShows(false), CHECK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [filled]);

  const openExplore = React.useCallback(() => openPodcastExplore(router), [router]);
  const startFresh = React.useCallback(() => {
    usePodcastPrefs.getState().set('onboarding', 'fresh');
    openPodcastExplore(router);
  }, [router]);
  const refresh = React.useCallback(() => {
    if (!pull.isPending) pull.mutate();
  }, [pull]);
  const viewAll = React.useCallback(
    (section: PodcastSection) => {
      void queryClient.prefetchQuery(createPodcastSectionQueryOptions(section));
      router.push({ pathname: '/podcasts/section/[type]', params: { type: section } });
    },
    [queryClient, router],
  );

  // Nothing here yet: no show followed, and no episode started, queued,
  // downloaded or kept. That is the welcome, whenever it is true: leaving
  // Explore without following anything comes back to it, as leaving the free
  // books' or the blogs' Explore does. Local data, one render away: nothing is
  // drawn for that one frame rather than a skeleton of it.
  const empty = home.shows.length === 0 && Object.values(home.shelves).every((shelf) => shelf.length === 0);
  const view: PodcastsPageView = importer.active ? 'import' : !home.loaded ? 'loading' : empty ? 'welcome' : 'home';

  return {
    view,
    home,
    leadsWithContinue,
    importer,
    episodes,
    pulling: pull.isPending,
    refresh,
    openExplore,
    startFresh,
    viewAll,
  };
}
