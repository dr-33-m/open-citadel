import React from 'react';
import { Keyboard, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import PagerView, {
  type PageScrollStateChangedNativeEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';

import { LibraryPage } from '@/components/hub/library-page';
import { SamwellPage } from '@/components/hub/samwell-page';
import { TimelinePage } from '@/components/hub/timeline-page';
import { useAfterIdle } from '@/navigation/use-after-idle';
import { HUB, useHubStore, type HubPage } from '@/stores/hub';
import { ThemeScope } from '@/components/theme-scope';
import { hubPageOrder } from '@/utils/theme-order';

/** The longest the neighbours wait for a Library that never reports (a failed load). */
const NEIGHBOUR_CAP_MS = 2500;

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

  // Both neighbours are mounted before anyone can reach them: a page has to
  // exist before it can be dragged into view. But not ahead of the Library.
  // They used to mount two frames after the first paint, which is the moment
  // the Library is reading its data and mounting its shelves, so the launch's
  // first content queued behind two pages nobody was looking at (Samwell is
  // the heaviest mount in the app). Now they wait for the Library to say it
  // has filled and for the thread to go quiet after it. A press on the header
  // or a drag that gets there first mounts them at once.
  const filled = useHubStore((s) => s.libraryFilled);
  const [dragged, setDragged] = React.useState(false);
  const neighbours = useAfterIdle({
    armed: filled,
    capMs: NEIGHBOUR_CAP_MS,
    now: dragged || requested !== HUB.library,
  });
  const onScrollState = React.useCallback((event: PageScrollStateChangedNativeEvent) => {
    if (event.nativeEvent.pageScrollState !== 'dragging') return;
    setDragged(true);
    // As the page starts to leave: asked once it has gone, the keyboard stayed.
    Keyboard.dismiss();
  }, []);

  // A drag is direct manipulation and stays exactly as it is under Reduce
  // Motion — the page is following the finger, and there is nothing there the
  // setting is asking us to remove. A button press is the other thing: that
  // one animates a page across on its own, which is the spatial motion the
  // setting does mean, so it cuts straight to the destination instead.
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (requested === shown.current) return;
    shown.current = requested;
    // The keyboard belongs to the page it was opened on (Samwell's composer).
    Keyboard.dismiss();
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
      // No haptic here. Moving between Timeline, Library and Samwell is
      // navigation, not a commit — nothing has changed by arriving, and the
      // page sliding into place is its own feedback. A thump on every swipe
      // made the three pages feel like three decisions.
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
      onPageScrollStateChanged={onScrollState}
      // Keeps all three alive so a swipe back never re-mounts and re-reads the
      // page the user just left.
      offscreenPageLimit={2}
    >
      <View key="timeline" collapsable={false} style={{ flex: 1 }}>
        {/* Each page is a theme scope: a new theme reaches the one in view
            first and the others after it (`utils/theme-order`). The Library
            scopes its own parts, so its sides can take their turns apart. */}
        {neighbours ? (
          <ThemeScope order={hubPageOrder(HUB.timeline, requested)}>
            <TimelinePage />
          </ThemeScope>
        ) : null}
      </View>
      <View key="library" collapsable={false} style={{ flex: 1 }}>
        <LibraryPage themeOrder={hubPageOrder(HUB.library, requested)} />
      </View>
      <View key="samwell" collapsable={false} style={{ flex: 1 }}>
        {neighbours ? (
          <ThemeScope order={hubPageOrder(HUB.samwell, requested)}>
            <SamwellPage />
          </ThemeScope>
        ) : null}
      </View>
    </PagerView>
  );
}
