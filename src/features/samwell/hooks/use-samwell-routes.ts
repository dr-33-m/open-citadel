import { useRouter } from 'expo-router';
import React from 'react';

import { CAN_SELL_PLANS } from '@/features/billing/utils/can-sell';
import { openEpisodePage, openShowPage } from '@/features/podcasts/hooks/open-podcast-page';
import { plansSheet } from '@/features/samwell/handles';
import type { PodcastCardKind } from '@/services/listening-tools/card';
import { HUB, useHubStore } from '@/stores/hub';

/**
 * Everywhere the Samwell page sends the reader, as stable callbacks: Settings
 * and its Samwell and Profile pages, the plans, and what a reply links to
 * (a highlight, the Timeline, a book, a show or an episode).
 */
export function useSamwellRoutes() {
  const router = useRouter();
  const goTo = useHubStore((s) => s.goTo);

  return React.useMemo(
    () => ({
      library: () => goTo(HUB.library),
      settings: () => router.push('/settings'),
      // Opened straight onto the page that can fix what is in the way.
      samwellSettings: () => router.push('/settings/samwell'),
      account: () => router.push('/settings/profile'),
      /**
       * The plans, sold here: the sheet rises over the wall, takes the payment,
       * and the wall is gone when it closes. A build that cannot sell anything
       * still goes to Settings, which says why.
       */
      plans: () => {
        if (CAN_SELL_PLANS) plansSheet.current?.open();
        else router.push({ pathname: '/settings/[pane]', params: { pane: 'samwell', panel: 'cloud' } });
      },
      // A highlight opens at its place in the reader; a thought has no passage,
      // so it goes to the Timeline that holds it.
      highlight: (bookId: string, locator: string) =>
        router.push({ pathname: '/reader/[id]', params: { id: bookId, locator } }),
      timeline: () => goTo(HUB.timeline),
      // The reader resumes at the saved position for a book already started.
      book: (bookId: string) => router.push({ pathname: '/reader/[id]', params: { id: bookId } }),
      podcast: (kind: PodcastCardKind, id: string) => {
        if (kind === 'show') openShowPage(router, id);
        else openEpisodePage(router, id);
      },
    }),
    [router, goTo],
  );
}

export type SamwellRoutes = ReturnType<typeof useSamwellRoutes>;
