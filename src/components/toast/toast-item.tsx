import React from 'react';
import { Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
// The real export, not a hand-rolled `runOnJS` wrapper: a plain JS helper is a
// Remote Function to the UI runtime, so calling one from a gesture callback
// throws "Tried to synchronously call a Remote Function".
import { scheduleOnRN } from 'react-native-worklets';

import { Card } from '@/components/ui/card';
import { ToastRow } from '@/components/toast/toast-row';
import type { ToastEntry } from '@/components/toast/types';
import { useToastStack } from '@/components/toast/use-toast-stack';

/** How far above its resting place a toast starts. */
const ENTER_OFFSET = 200;
const HIDDEN_SCALE = 0.7;
const AUTO_DISMISS_MS = 3000;
/**
 * A toast with something to press stays longer. Three seconds is enough to
 * read "Renamed"; it is not enough to read "He will forget that note", decide,
 * and reach the Undo, which measured on a Galaxy A33 was gone before the
 * thumb got there.
 */
const ACTION_DISMISS_MS = 6000;
const FADE_IN_MS = 200;
const EXIT_MS = 160;
/** The exit drifts back the way it came in, which for a top toast is upward. */
const EXIT_RISE = 40;
const SWIPE_EXIT_RISE = 80;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const DISMISS_DISTANCE = 56;
const DISMISS_VELOCITY = 800;

/**
 * Resistance in the direction that does NOT dismiss.
 *
 * Asymptotic, so the toast never stops dead against a boundary — it just gives
 * less and less, which is how a real object behaves and how the reader learns
 * there is nothing further that way.
 */
function rubberBand(distance: number) {
  'worklet';
  return (40 * distance) / (distance + 120);
}

type ToastItemProps = {
  toast: ToastEntry;
  /** 0 is the front toast. Counted by the provider, not an array position. */
  index: number;
  /** The front toast's height. Every card behind it peeks out from under ITS bottom. */
  frontHeight: number;
  /** Reports this toast's height, so the provider can hand the front one's around. */
  onHeight: (id: number, height: number) => void;
  /** How many toasts are live. A pile of one has nothing to spread. */
  stackSize: number;
  /** The pile is spread into a column, every toast readable and in reach. */
  spread: boolean;
  /** This toast's top in that column. */
  spreadOffset: number;
  onToggleSpread: () => void;
  /** Shared by the pile: how far the front toast is being dragged. */
  frontDrag: SharedValue<number>;
  onDismissStart: (id: number) => void;
  onDismissed: (id: number) => void;
};

/**
 * One toast, and the only thing that knows how a toast moves.
 *
 * The app's toasts appear at the TOP. The bottom is where this app already
 * keeps the things you act on — the floating composer, the FAB, the log deck's
 * own buttons — and a toast landing there covers a control the thumb is already
 * heading for. So the whole vertical axis is mirrored against the usual
 * bottom-anchored version of this animation: it enters from above, the stack
 * peeks downward, dragging UP dismisses and dragging down resists, and the exit
 * rises. Every threshold and duration is unchanged.
 */
export function ToastItem({
  toast,
  index,
  frontHeight,
  onHeight,
  stackSize,
  spread,
  spreadOffset,
  onToggleSpread,
  frontDrag,
  onDismissStart,
  onDismissed,
}: ToastItemProps) {
  const reduced = useReducedMotion();

  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);
  const dragY = useSharedValue(0);

  const exiting = React.useRef(false);
  const stack = useToastStack({
    id: toast.id,
    index,
    frontHeight,
    spread,
    spreadOffset,
    reduced,
    exiting,
    opacity,
    frontDrag,
    onHeight,
  });
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // `dismiss` needs the LIVE depth to decide whether to drop as it leaves, and
  // it cannot take `index` as a dependency without rebuilding the timer chain
  // every time the pile reshuffles. Mirrored in an effect rather than written
  // during render, which the refs lint rule rightly forbids.
  const indexRef = React.useRef(index);
  React.useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const clearTimer = React.useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const finishDismiss = React.useCallback(() => {
    onDismissed(toast.id);
  }, [onDismissed, toast.id]);

  const dismiss = React.useCallback(
    (kind: 'timeout' | 'close' | 'swipe') => {
      if (exiting.current) return;
      exiting.current = true;
      clearTimer();
      // The card behind stops showing through once this one is on its way.
      if (indexRef.current === 0) frontDrag.set(withTiming(0, { duration: EXIT_MS }));
      // Announced at the START of the exit, so the toasts behind it begin
      // closing the gap while this one is still fading rather than after.
      onDismissStart(toast.id);

      opacity.set(
        withTiming(0, { duration: EXIT_MS }, (finished) => {
          if (finished) scheduleOnRN(finishDismiss);
        }),
      );

      // Reduced motion keeps the fade and drops the travel: the arrival and the
      // leaving still have to be noticed, they just do not move across the eye.
      if (reduced) return;
      if (kind === 'swipe') {
        dragY.set(
          withTiming(dragY.get() - SWIPE_EXIT_RISE, { duration: EXIT_MS, easing: EASE_OUT }),
        );
      } else if (indexRef.current === 0) {
        dragY.set(withTiming(-EXIT_RISE, { duration: EXIT_MS, easing: EASE_OUT }));
      }
    },
    [clearTimer, dragY, finishDismiss, frontDrag, onDismissStart, opacity, reduced, toast.id],
  );

  // A busy toast waits for its work, however long that takes.
  const persistent = toast.persistent === true || toast.busy === true || toast.accessory != null;
  const lifeMs = toast.onActionPress ? ACTION_DISMISS_MS : AUTO_DISMISS_MS;

  const restartTimer = React.useCallback(() => {
    if (exiting.current) return;
    clearTimer();
    // A toast that asked a question waits for the answer. Everything else
    // still leaves on its own.
    // Nor does anything while the pile is spread; see below.
    if (persistent || spread) return;
    timer.current = setTimeout(() => dismiss('timeout'), lifeMs);
  }, [clearTimer, dismiss, lifeMs, persistent, spread]);


  const commitSwipeDismiss = React.useCallback(() => dismiss('swipe'), [dismiss]);

  React.useEffect(() => {
    progress.set(reduced ? 1 : withSpring(1));
    opacity.set(withTiming(1, { duration: FADE_IN_MS }));
    restartTimer();
    return clearTimer;
    // Arrival happens once, on mount, whatever else changes afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closed by its caller (`dismissToast`), the way a press on its close would.
  React.useEffect(() => {
    if (toast.closing) dismiss('close');
  }, [toast.closing, dismiss]);

  /*
   * Written over in place: the content changed under a reader who may have
   * only just started on the old line, so the three seconds start again.
   *
   * Keyed on the revision rather than the message, so a replacement that only
   * changes the tone still resets the clock, and a re-render that changes
   * nothing does not.
   */
  const firstRevision = React.useRef(toast.revision);
  React.useEffect(() => {
    if (toast.revision === firstRevision.current) return;
    restartTimer();
  }, [toast.revision, restartTimer]);

  /*
   * Spread, nothing leaves on its own: the reader opened the pile to read it,
   * and a card sliding out of the column under their eye is the column
   * rearranging itself while they look. Collapsing starts the clocks again.
   */
  const firstSpread = React.useRef(spread);
  React.useEffect(() => {
    if (spread === firstSpread.current) return;
    firstSpread.current = spread;
    if (spread) clearTimer();
    else restartTimer();
  }, [spread, clearTimer, restartTimer]);

  const front = index === 0 && !spread;
  /* eslint-disable react-hooks/refs -- `clearTimer` and `restartTimer` touch
     the timer ref, and the rule sees them being handed to the gesture during
     render. They are only ever CALLED from a gesture event, never from the
     render pass, which is the thing the rule exists to catch. The timer has to
     be a ref: it is cleared and restarted several times per gesture and none
     of that should draw a frame. */
  const pan = Gesture.Pan()
    // Collapsed, only the front one is draggable: the pile behind it is a hint
    // about how many there are, not a set of separate controls. Spread, each
    // is its own card and each can be swiped away.
    .enabled(index === 0 || spread)
    .onBegin(() => {
      scheduleOnRN(clearTimer);
    })
    .onUpdate((e) => {
      // Up is the way out, so up tracks the finger exactly. Down is going
      // nowhere, so it resists.
      dragY.set(e.translationY <= 0 ? e.translationY : rubberBand(e.translationY));
      if (front) frontDrag.set(dragY.get());
    })
    .onEnd((e) => {
      if (e.translationY < -DISMISS_DISTANCE || e.velocityY < -DISMISS_VELOCITY) {
        scheduleOnRN(commitSwipeDismiss);
      } else {
        dragY.set(withSpring(0));
        if (front) frontDrag.set(withSpring(0));
        scheduleOnRN(restartTimer);
      }
    })
    // A gesture that never activated still stopped the clock in `onBegin`, so
    // it has to start it again or the toast hangs there forever.
    .onFinalize((_e, success) => {
      if (!success) scheduleOnRN(restartTimer);
    });
  /* eslint-enable react-hooks/refs */

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: opacity.get(),
      transform: [
        { translateY: -(1 - p) * ENTER_OFFSET + stack.stackY.get() + dragY.get() },
        { scale: (HIDDEN_SCALE + (1 - HIDDEN_SCALE) * p) * stack.stackScale.get() },
      ],
    };
  });

  // A tap on any card spreads the pile, and a tap on any card stacks it
  // again. The card's own controls are pressables inside this one, so they
  // keep their presses.
  const canSpread = stackSize > 1;
  // A collapsed card behind shows only its edge, and its controls are hidden
  // with its words: a tap on that edge must not reach a stop nobody can see.
  const controlsLive = index === 0 || spread;
  const spreadHint = canSpread ? (spread ? 'Stacks the notifications again' : 'Shows every notification') : undefined;
  const handleAction = () => {
    toast.onActionPress?.();
    // Slow work started by the action needs the toast it is reported in to
    // survive the press.
    if (!toast.keepOpenOnAction) dismiss('close');
  };
  const handleClose = () => {
    toast.onDismissPress?.();
    dismiss('close');
  };

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[{ position: 'absolute', left: 16, right: 16, zIndex: 100 - index }, animatedStyle]}
        onLayout={stack.onLayout}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Pressable disabled={!canSpread} onPress={onToggleSpread} accessibilityHint={spreadHint}>
          <Card>
            <Animated.View style={stack.contentStyle} pointerEvents={controlsLive ? 'auto' : 'none'}>
              <ToastRow toast={toast} persistent={persistent} onAction={handleAction} onClose={handleClose} />
            </Animated.View>
          </Card>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}
