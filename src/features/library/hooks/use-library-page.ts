import React from 'react';

import { useLibraryBoot } from '@/features/library/hooks/use-library-boot';
import { sideSettleMs } from '@/features/library/utils/library-sides';
import { HUB, useHubStore } from '@/stores/hub';
import { usePodcastPrefs, type LibraryTab } from '@/stores/podcast-prefs';

/**
 * The Library shell's state: which side is showing, which sides have been
 * opened, and the header's way to the hub's other pages. The side last left
 * open is remembered, and the app comes back to it.
 *
 * A side is not mounted until it is opened, books included. Books used to
 * mount with the app whichever side it opened on, so someone who left the
 * Library on Blogs paid for the books side's skeleton, its shelves and their
 * covers underneath the page they were actually waiting for.
 *
 * What does start with the app is the books' DATA (`useLibraryBoot`): Samwell
 * reads the same store, and the launch scan belongs to the app opening rather
 * than to a side being looked at. So it lives here, and the books side is
 * told when it has landed.
 */
export function useLibraryPage() {
  const tab = usePodcastPrefs((s) => s.libraryTab);
  const booted = useLibraryBoot();
  // The side the app opened on. It has no fade to wait out, so it fills as
  // soon as it has its data; any other arrives through the switch.
  const [openedOn] = React.useState(tab);
  const [mounted, setMounted] = React.useState<Record<LibraryTab, boolean>>(() => ({
    books: tab === 'books',
    podcasts: tab === 'podcasts',
    blogs: tab === 'blogs',
  }));

  // The switch moves in the tap's own render, and that is all the tap waits
  // for. A side opened for the first time is built behind it, as a transition:
  // built in the same render, the switch stood still until the whole side had
  // mounted and read its library, and the tap looked as if it had not landed.
  // The side being left fades out meanwhile, and the new one fades in on its
  // skeleton as soon as it exists.
  const changeTab = React.useCallback((next: LibraryTab) => {
    usePodcastPrefs.getState().set('libraryTab', next);
    React.startTransition(() => {
      setMounted((prev) => (prev[next] ? prev : { ...prev, [next]: true }));
    });
  }, []);
  const openTimeline = React.useCallback(() => useHubStore.getState().goTo(HUB.timeline), []);
  const openSamwell = React.useCallback(() => useHubStore.getState().goTo(HUB.samwell), []);
  const settleMs = React.useMemo(
    () => ({
      books: sideSettleMs('books', openedOn),
      podcasts: sideSettleMs('podcasts', openedOn),
      blogs: sideSettleMs('blogs', openedOn),
    }),
    [openedOn],
  );

  return { tab, mounted, booted, settleMs, changeTab, openTimeline, openSamwell };
}
