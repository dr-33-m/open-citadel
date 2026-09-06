import React from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
// The real export, not a `runOnJS` wrapper: a plain JS helper is a Remote
// Function to the UI runtime, so calling one from a gesture callback throws.
import { scheduleOnRN } from 'react-native-worklets';

import { PageFade } from '@/components/scroll-fades';
import { SyncIndicator } from '@/components/library/sync-indicator';
import { easing, motion } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

/**
 * How tall the gap is once it is holding, in points.
 *
 * Enough for the loader, the gap under it and one line of label, and no more:
 * the gap pushes the shelf below it down the screen for as long as a scan
 * lasts, so every extra point is a point of the Library nobody can see.
 */
const GAP = 72;

/**
 * How far the gap has to be open before letting go starts a scan.
 *
 * Read against the RESISTED distance, not the finger's, so it is worth doing
 * the arithmetic before changing it: `resist` is asymptotic to 115, and at 64
 * it wanted 144 points of travel to arm — half again as far as a pull-to-
 * refresh anywhere else. At 52 it arms at about 95, and the gap keeps opening
 * a little past that, which reads as the pull confirming rather than stopping.
 */
const TRIGGER = 52;

/**
 * How far the drag has to travel before the pull takes it.
 *
 * The Library is one page of a horizontal pager, and the shelf under the
 * finger scrolls vertically, so a drag here has two other readings. Waiting
 * this long before claiming it means an ordinary flick up the page, and an
 * ordinary swipe across to Samwell, never open a gap on the way past.
 */
const ACTIVATE = 12;

/** A sideways drag belongs to the pager, and stops being ours immediately. */
const SIDEWAYS = 12;

/**
 * How long the gap takes to give way after a pull that started a scan.
 *
 * Deliberately slower than the app's `base`, and the one number here worth
 * explaining. On release the finger's gap unwinds while the scan's own hold
 * winds up, and the two are handed over between the JS thread and the UI
 * thread: the pipeline has to write a row and report itself running before
 * `sync.status` reaches this component. Unwind at `base` and the gap is shut
 * before that lands, so the indicator blinks out and back. The rendered height
 * is the LARGER of the two, so overlapping them is invisible — a pull that
 * starts nothing still closes, it just takes its time about it.
 */
const RELEASE_MS = 420;

/**
 * Resistance, so the gap never simply follows the finger.
 *
 * Asymptotic rather than clamped: it gives less and less instead of stopping
 * dead, which is how a real object behaves and is what tells the hand it has
 * reached the end without a boundary being drawn. The same curve the toasts
 * use for the direction that does not dismiss.
 */
function resist(distance: number) {
  'worklet';
  // Callers pass a distance of zero or more; see the clamp in `onUpdate`.
  return (GAP * 1.6 * distance) / (distance + GAP * 1.6);
}

export type PullToSyncProps = Pick<
  ScrollViewProps,
  'contentContainerStyle' | 'contentContainerClassName'
> & {
  /**
   * Whether a scan is going on, which is all this needs to hold the gap open.
   * A boolean and not the scan itself: the counters change several times a
   * second and the indicator reads them for itself. See `SyncIndicator`.
   */
  running: boolean;
  /** Called once, on a release past `TRIGGER`. */
  onSync: () => void;
  children: React.ReactNode;
};

/**
 * The Library's scroller, and the gap you pull open above it to start a scan.
 *
 * ## Why the gesture is hand-built
 *
 * `RefreshControl` is the obvious answer and draws the wrong thing: a round
 * OS spinner, in an app with no rounded corners and its own loader. Reading
 * `contentOffset` for a negative value is the other obvious answer and does
 * not work here at all — that is iOS bounce, and Android has none, so on the
 * device this app is built for the offset never goes below zero.
 *
 * So it is a pan that runs alongside the scroll view's own gesture and only
 * has an opinion while the shelf is already at the top. Everything it moves is
 * a transform. An earlier sketch grew a spacer above the scroller instead,
 * which is a Yoga pass per frame on the app's longest page.
 *
 * ## Why the gap outlives the finger
 *
 * Letting go is not the end of the scan, it is the start of it, so the gap
 * stays open and becomes where the scan reports itself. The height drawn is
 * the larger of what the finger is holding and what the scan is holding, which
 * is what makes the handover between the two invisible — see `RELEASE_MS`.
 *
 * That is also why a scan started from anywhere else opens the same gap: the
 * indicator has one home on this screen, whether the scan came from a pull,
 * from the launch scan or from the button in All Books.
 */
export function PullToSync({
  running,
  onSync,
  contentContainerStyle,
  contentContainerClassName,
  children,
}: PullToSyncProps) {
  const reduced = useReducedMotion();

  /** How far down the shelf is. The pull only has standing at the very top. */
  const scrollY = useSharedValue(0);
  /** What the finger is holding open. */
  const drag = useSharedValue(0);
  /** What the scan is holding open. */
  const hold = useSharedValue(0);

  // Composed onto `ScrollFade`'s own handler by `PageFade` — see its `onScroll`
  // note. It has to be an animated handler for that to work.
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.set(event.contentOffset.y);
    },
  });

  React.useEffect(() => {
    hold.set(withTiming(running ? GAP : 0, { duration: motion.base, easing }));
  }, [running, hold]);

  /*
   * Whether letting go now would start a scan.
   *
   * A boolean and not the distance, so this crosses to React twice in a pull
   * rather than on every frame of one. The label is the only thing that needs
   * to know, and it has two things to say.
   */
  const [armed, setArmed] = React.useState(false);
  useAnimatedReaction(
    () => drag.get() >= TRIGGER,
    (isArmed, wasArmed) => {
      if (wasArmed === null || isArmed === wasArmed) return;
      scheduleOnRN(setArmed, isArmed);
      // The one moment in the pull worth feeling: it has become a decision.
      // Nothing on the way back down — passing the line the other way is the
      // reader taking something back, not committing to it.
      if (isArmed) scheduleOnRN(haptics.select);
    },
  );

  /*
   * Claimed by hand, rather than by declaring a truce with the scroll view.
   *
   * The obvious version is `simultaneousWithExternalGesture(scrollRef)`, and
   * it does not work here: `PageFade` clones its child onto an animated
   * component of its own, so a ref put on the `ScrollView` lands on the
   * wrapper and gesture-handler never finds a handler to be simultaneous
   * WITH. There is no truce, the pan wins every downward drag, and the page
   * cannot be scrolled back up — which is exactly what it did.
   *
   * `manualActivation` needs no ref and no arbitration. The gesture sits in
   * BEGAN, blocking nothing, until the two things that make a drag ours are
   * both true: the shelf is at the very top, and the finger is heading down.
   * Anything else fails it outright and the scroll view keeps the touch.
   */
  const startY = useSharedValue(0);
  const startX = useSharedValue(0);

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onBegin((event) => {
      startY.set(event.absoluteY);
      startX.set(event.absoluteX);
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch) return;
      const down = touch.absoluteY - startY.get();
      const across = Math.abs(touch.absoluteX - startX.get());

      // Off the top of the shelf, heading up, or heading across to another
      // hub page: not ours, and saying so hands the touch straight back.
      // The small allowance on the offset absorbs it wobbling around zero.
      if (scrollY.get() > 1 || down < 0 || across > SIDEWAYS) {
        manager.fail();
        return;
      }
      if (down > ACTIVATE) manager.activate();
    })
    .onUpdate((event) => {
      /*
       * Measured from where the pull was CLAIMED, and never below zero.
       *
       * Both halves matter. Without the offset the gap jumps straight to the
       * eleven points `ACTIVATE` had already travelled, so it opens with a
       * pop instead of from nothing.
       *
       * Without the clamp it is worse than untidy: `resist` is only defined
       * for a downward drag, its denominator crosses zero at -115, and past
       * that it returns large POSITIVE numbers — so dragging back up to
       * change your mind, which is the most ordinary thing to do with a pull
       * you did not mean, threw the gap open to 271 points instead of
       * closing it.
       */
      drag.set(resist(Math.max(0, event.translationY - ACTIVATE)));
    })
    .onEnd(() => {
      if (drag.get() >= TRIGGER) scheduleOnRN(onSync);
      drag.set(reduced ? 0 : withTiming(0, { duration: RELEASE_MS, easing }));
    })
    // A cancelled pan — a call arriving, the app going away — still has to put
    // the gap back, or it stays open with nothing holding it.
    .onFinalize((_event, success) => {
      if (success) return;
      drag.set(reduced ? 0 : withTiming(0, { duration: motion.base, easing }));
    });

  /*
   * How far open the gap is: whichever of the two is holding it wider.
   *
   * Derived once rather than worked out inside each style below. Both need the
   * same number every frame, and written twice it is also the same DECISION
   * twice — the kind that drifts the moment one of them grows a condition.
   */
  const open = useDerivedValue(() => Math.max(drag.get(), hold.get()));

  const gap = useAnimatedStyle(() => ({
    opacity: Math.min(open.get() / GAP, 1),
    transform: [{ translateY: open.get() }],
  }));

  const content = useAnimatedStyle(() => ({
    transform: [{ translateY: open.get() }],
  }));

  return (
    // Clips the strip parked above it, so nothing shows until it is pulled.
    <View className="flex-1 overflow-hidden">
      <Animated.View
        pointerEvents="none"
        style={[gap, { position: 'absolute', top: -GAP, height: GAP }]}
        className="inset-x-0 items-center justify-center"
      >
        <SyncIndicator
          label={running ? undefined : armed ? 'RELEASE TO SYNC' : 'PULL TO SYNC'}
        />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={content} className="flex-1">
          <PageFade>
            <ScrollView
              className="flex-1"
              onScroll={onScroll}
              contentContainerClassName={contentContainerClassName}
              contentContainerStyle={contentContainerStyle}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </PageFade>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
