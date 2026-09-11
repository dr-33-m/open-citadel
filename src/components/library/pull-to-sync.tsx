import React from "react";
import {
    Platform,
    RefreshControl,
    ScrollView,
    View,
    type ScrollViewProps,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    useAnimatedReaction,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useDerivedValue,
    useReducedMotion,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
// The real export, not a `runOnJS` wrapper: a plain JS helper is a Remote
// Function to the UI runtime, so calling one from a gesture callback throws.
import { scheduleOnRN } from "react-native-worklets";

import { SyncIndicator } from "@/components/library/sync-indicator";
import { PageFade } from "@/components/scroll-fades";
import { easing, motion } from "@/constants/theme";
import { haptics } from "@/utils/haptics";

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

/**
 * How far a touch has to move before it is read as having a direction at all.
 *
 * A finger landing on glass wobbles a point or two in every direction before
 * it goes anywhere, and this gesture answers with a verdict it cannot take
 * back: one `manager.fail()` and the touch belongs to the scroll view for
 * good. Reading a direction out of that first noise is what made the pull
 * unreliable — a single upward point of jitter killed it before it began.
 */
const SLOP = 6;

/**
 * How long the gap waits for a scan it asked for.
 *
 * Letting go past `TRIGGER` starts a scan, but the pipeline has a row to write
 * and a folder to open before `sync.status` says so, and on a big library over
 * SAF that is not instant. The gap used to unwind on a timer sized to guess
 * that delay, and when the guess was short — which it often was — the reader
 * watched it shut and reopen. It now holds itself open from the moment of the
 * release until the scan reports, and this is only the backstop for a scan
 * that never does: long enough that no real one is cut off, short enough that
 * a gap holding nothing does not become furniture.
 */
const SCAN_GRACE_MS = 5_000;

/**
 * Resistance, so the gap never simply follows the finger.
 *
 * Asymptotic rather than clamped: it gives less and less instead of stopping
 * dead, which is how a real object behaves and is what tells the hand it has
 * reached the end without a boundary being drawn. The same curve the toasts
 * use for the direction that does not dismiss.
 */
function resist(distance: number) {
  "worklet";
  // Callers pass a distance of zero or more; see the clamp in `onUpdate`.
  return (GAP * 1.6 * distance) / (distance + GAP * 1.6);
}

export type PullToSyncProps = Pick<
  ScrollViewProps,
  "contentContainerStyle" | "contentContainerClassName"
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
 * iOS uses `RefreshControl` only as the native recognizer, with its spinner
 * transparent. `UIScrollView` otherwise claims the drag while a manual child
 * pan is still waiting to activate, so the custom gesture never reaches its
 * threshold there. Its negative content offset drives this indicator instead.
 *
 * Android has no negative bounce offset, so it uses a pan that runs alongside
 * the scroll view's own gesture and only has an opinion while the shelf is
 * already at the top. That path moves the shelf with a transform. An earlier
 * sketch grew a spacer above the scroller instead, which is a Yoga pass per
 * frame on the app's longest page.
 *
 * ## Why the gap outlives the finger
 *
 * Letting go is not the end of the scan, it is the start of it, so the gap
 * stays open and becomes where the scan reports itself. The height drawn is
 * the larger of what the finger is holding and what the scan is holding, and
 * the release puts the second one up before it takes the first one down, so
 * there is no frame between them — see `SCAN_GRACE_MS`.
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
  const usesNativeRefresh = Platform.OS === "ios";

  /** How far down the shelf is. The pull only has standing at the very top. */
  const scrollY = useSharedValue(0);
  /** What the finger is holding open. */
  const drag = useSharedValue(0);
  /** What a scan — asked for, running, or both — is holding open. */
  const hold = useSharedValue(0);

  /*
   * A pull has started a scan and is waiting for it to say so.
   *
   * State and not a ref, though a ref is what this wants to be. Two things
   * read it — the effect that decides whether `running: false` means "no scan"
   * or "not yet", and the label, which must not print PULL TO SYNC under a
   * loader that is already going — and one of them renders. A ref would also
   * have to travel into the gesture's `onEnd`, which is built during render,
   * and reading one from there is exactly what refs are not for.
   */
  const [waiting, setWaiting] = React.useState(false);
  /*
   * Cleared the moment the scan it was waiting for arrives, during render
   * rather than in an effect: the answer is knowable from `running` right
   * here, and an effect would commit a frame with both flags true.
   */
  if (waiting && running) setWaiting(false);

  // Composed onto `ScrollFade`'s own handler by `PageFade` — see its `onScroll`
  // note. It has to be an animated handler for that to work.
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.set(event.contentOffset.y);
      if (usesNativeRefresh) {
        drag.set(resist(Math.max(0, -event.contentOffset.y)));
      }
    },
  });

  React.useEffect(() => {
    if (running) {
      /*
       * The scan has arrived. If a pull put the gap up already this animates
       * from `GAP` to `GAP` and does nothing, which is the point; if the scan
       * came from somewhere else — the launch scan, the button in All Books —
       * this is what opens it.
       */
      hold.set(
        reduced ? GAP : withTiming(GAP, { duration: motion.base, easing }),
      );
      return;
    }
    // Not running, and a pull is still waiting on the scan it asked for.
    // Closing the gap here is the blink: it is the whole bug.
    if (waiting) return;
    hold.set(reduced ? 0 : withTiming(0, { duration: motion.base, easing }));
  }, [running, waiting, hold, reduced]);

  /*
   * The backstop for a scan that never reports.
   *
   * Mounted with the wait and torn down with it, so a scan that arrives takes
   * the timer with it rather than racing it. Nothing here touches the gap
   * directly: dropping `waiting` is enough, because the effect above is
   * already watching for exactly that.
   */
  React.useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaiting(false), SCAN_GRACE_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  const handleNativeRefresh = () => {
    hold.set(GAP);
    setWaiting(true);
    onSync();
  };

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
   * Android is claimed by hand, rather than by declaring a truce with the
   * scroll view. iOS bypasses this gesture entirely; see the component note.
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
  /** Whether this touch has already been claimed. See the guard below. */
  const claimed = useSharedValue(false);

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onBegin((event) => {
      startY.set(event.absoluteY);
      startX.set(event.absoluteX);
      claimed.set(false);
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch) return;

      /*
       * Once it is ours, it stays ours.
       *
       * `onTouchesMove` keeps firing after activation, and every test below is
       * a test for whether to TAKE the touch, not for whether to keep it. Left
       * running, a pull held open at the top of its travel could still fail
       * itself on a bit of late sideways drift, cancelling the gesture and
       * dropping a gap the reader was in the middle of opening. That is the
       * other half of "unreliable": not only pulls that never started, but
       * pulls that died on the way.
       */
      if (claimed.get()) return;
      const down = touch.absoluteY - startY.get();
      const across = Math.abs(touch.absoluteX - startX.get());

      /*
       * Say nothing until the touch has actually gone somewhere.
       *
       * Every branch below is final — `fail()` cannot be taken back, and the
       * scroll view keeps the touch for the rest of its life. So the first
       * point or two of travel, which is the finger settling rather than the
       * reader deciding, gets no verdict at all. Without this a single upward
       * pixel of jitter at touch-down killed the pull outright, which is most
       * of why it felt unreliable.
       */
      if (Math.abs(down) < SLOP && across < SLOP) return;

      // Off the top of the shelf, or heading up it: not ours, and saying so
      // hands the touch straight back. The small allowance on the offset
      // absorbs it wobbling around zero.
      if (scrollY.get() > 1 || down < 0) {
        manager.fail();
        return;
      }

      /*
       * Sideways is measured against downward, not against a fixed number.
       *
       * A swipe across to Samwell is nearly all sideways and fails here on its
       * first real movement, which is what this is for. But a thumb pulling
       * down travels on an arc, and it was being held to twelve points of
       * drift over any distance: past about sixty points of pull, an ordinary
       * thumb has drifted further than that and the gesture died mid-pull
       * having already opened the gap. Dominance is the question worth asking.
       */
      if (across > down) {
        manager.fail();
        return;
      }

      if (down > ACTIVATE) {
        claimed.set(true);
        manager.activate();
      }
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
      /*
       * The hold goes up before the finger comes down.
       *
       * Both happen on this frame and on this thread, so the gap is never
       * unheld: `hold` goes to the full gap with no animation while `drag`
       * still has it there, and the unwind below is invisible because the max
       * of the two does not move. This is why the release no longer needs a
       * timing sized to outlast the pipeline.
       */
      if (drag.get() >= TRIGGER) {
        // No animation, and on this thread: the finger is still holding
        // roughly this much, so there is no frame in which the two disagree.
        hold.set(GAP);
        scheduleOnRN(setWaiting, true);
        scheduleOnRN(onSync);
      }
      drag.set(reduced ? 0 : withTiming(0, { duration: motion.base, easing }));
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
    // UIRefreshControl owns the iOS inset through the whole scan. Translating
    // this viewport as well would reveal an empty strip along its bottom.
    transform: [{ translateY: usesNativeRefresh ? 0 : open.get() }],
  }));

  const scrollable = (
    <Animated.View style={content} className="flex-1">
      <PageFade>
        <ScrollView
          className="flex-1"
          onScroll={onScroll}
          contentContainerClassName={contentContainerClassName}
          contentContainerStyle={contentContainerStyle}
          refreshControl={
            usesNativeRefresh ? (
              <RefreshControl
                refreshing={running || waiting}
                onRefresh={handleNativeRefresh}
                tintColor="transparent"
              />
            ) : undefined
          }
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </PageFade>
    </Animated.View>
  );

  const gestureContent = usesNativeRefresh ? (
    scrollable
  ) : (
    <GestureDetector gesture={pan}>{scrollable}</GestureDetector>
  );

  return (
    // Clips the strip parked above it, so nothing shows until it is pulled.
    <View className="flex-1 overflow-hidden">
      <Animated.View
        pointerEvents="none"
        style={[gap, { position: "absolute", top: -GAP, height: GAP }]}
        className="inset-x-0 items-center justify-center"
      >
        {/* No label once a scan is on its way, whether or not it has reported
            itself yet: `SyncIndicator` says what it is doing, and "PULL TO
            SYNC" printed under a running loader is the gap contradicting
            itself. */}
        <SyncIndicator
          label={
            running || waiting
              ? undefined
              : armed
                ? "RELEASE TO SYNC"
                : "PULL TO SYNC"
          }
        />
      </Animated.View>

      {gestureContent}
    </View>
  );
}
