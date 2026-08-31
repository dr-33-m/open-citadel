import React from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';

import { LibraryPage } from '@/components/hub/library-page';
import { SamwellPage } from '@/components/hub/samwell-page';
import { TimelinePage } from '@/components/hub/timeline-page';
import { useAfterFirstPaint } from '@/navigation/use-after-first-paint';
import { HUB, useHubStore, type HubPage } from '@/stores/hub';
import { haptics } from '@/utils/haptics';

/**
 * The hub: Timeline, Library and Samwell as three pages of one screen.
 *
 * They used to be three routes with a swipe from a 44dp strip at each screen
 * edge standing in for a pager. That strip is the problem: on Android with
 * gesture navigation — the default on every current device — both screen
 * edges belong to the system Back gesture, so an edge-originated drag is
 * taken by the OS before the app sees the end of it. Measured on a Galaxy
 * A33, the gesture reported about 30dp of travel and then simply stopped
 * receiving touches. There is no threshold tuning that fixes that; the
 * gesture was in a place the app is not allowed to use.
 *
 * A pager takes the whole width instead, so it never goes near the edges, and
 * it is finger-tracked rather than triggered: the next page follows the drag
 * and can be pushed back before it commits. That is the difference the
 * routes could not give — a pushed route is not mounted until it is
 * navigated to, so there was never anything on screen to follow the finger.
 *
 * This is `ViewPager2` on Android and `UIPageViewController` on iOS, both
 * driven natively, which also means the drag keeps tracking while the JS
 * thread is busy.
 *
 * Peers, not a hierarchy: moving between these pages is not navigation and
 * leaves no history, so the system back button still means "leave the app"
 * from anywhere in the hub rather than walking back through pages the user
 * swiped past.
 */
export function HubPager() {
  const pagerRef = React.useRef<PagerView>(null);
  const requested = useHubStore((s) => s.page);
  const settled = useHubStore((s) => s.settled);

  // What the pager itself believes is on screen. Kept in a ref rather than
  // state because it exists only to stop the effect below from commanding the
  // pager to the page it is already on, which would fight a live drag.
  const shown = React.useRef<HubPage>(HUB.library);

  // Both neighbours mount with the pager — a page has to exist before it can
  // be dragged into view, so lazily mounting them would mean swiping onto a
  // blank one. Waiting a frame keeps them off the app's first paint, which is
  // the part the user is actually waiting on at launch.
  const painted = useAfterFirstPaint();

  // A drag is direct manipulation and stays exactly as it is under Reduce
  // Motion — the page is following the finger, and there is nothing there the
  // setting is asking us to remove. A button press is the other thing: that
  // one animates a page across on its own, which is the spatial motion the
  // setting does mean, so it cuts straight to the destination instead.
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (requested === shown.current) return;
    shown.current = requested;
    const pager = pagerRef.current;
    if (!pager) return;
    if (reduceMotion) pager.setPageWithoutAnimation(requested);
    else pager.setPage(requested);
  }, [requested, reduceMotion]);

  const onPageSelected = React.useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      const position = event.nativeEvent.position as HubPage;
      if (position === shown.current) return;
      shown.current = position;
      // The page catching is the moment worth feeling, and it is one per
      // gesture. `onPageSelected` fires on a settled page, so this lands with
      // the page arriving rather than partway through the drag.
      haptics.select();
      settled(position);
    },
    [settled],
  );

  return (
    <PagerView
      ref={pagerRef}
      style={{ flex: 1 }}
      initialPage={HUB.library}
      onPageSelected={onPageSelected}
      // Keeps all three alive so a swipe back never re-mounts and re-reads the
      // page the user just left.
      offscreenPageLimit={2}
    >
      <View key="timeline" collapsable={false} style={{ flex: 1 }}>
        {painted ? <TimelinePage /> : null}
      </View>
      <View key="library" collapsable={false} style={{ flex: 1 }}>
        <LibraryPage />
      </View>
      <View key="samwell" collapsable={false} style={{ flex: 1 }}>
        {painted ? <SamwellPage /> : null}
      </View>
    </PagerView>
  );
}
