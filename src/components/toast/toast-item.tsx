import React from 'react';
import { Pressable, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
// The real export, not a hand-rolled `runOnJS` wrapper: a plain JS helper is a
// Remote Function to the UI runtime, so calling one from a gesture callback
// throws "Tried to synchronously call a Remote Function".
import { scheduleOnRN } from 'react-native-worklets';
import { CircleCheck, X } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { Card } from '@/components/ui/card';
import type { ToastEntry } from '@/components/toast/types';
import { fontFamily } from '@/constants/theme';
import { asColor } from '@/utils/colors';

/** How far above its resting place a toast starts. */
const ENTER_OFFSET = 200;
const HIDDEN_SCALE = 0.7;
const AUTO_DISMISS_MS = 3000;
const FADE_IN_MS = 200;
const EXIT_MS = 160;
/** The exit drifts back the way it came in, which for a top toast is upward. */
const EXIT_RISE = 40;
const SWIPE_EXIT_RISE = 80;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const DISMISS_DISTANCE = 56;
const DISMISS_VELOCITY = 800;
/** How much of each toast behind the front one shows past its bottom edge. */
const STACK_PEEK = 14;
const STACK_SCALE_STEP = 0.05;
const MAX_VISIBLE = 3;

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
export function ToastItem({ toast, index, onDismissStart, onDismissed }: ToastItemProps) {
  const reduced = useReducedMotion();
  const [foreground, mutedForeground, success] = useCSSVariable([
    '--color-foreground',
    '--color-muted-foreground',
    '--color-success-foreground',
  ]);

  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);
  const dragY = useSharedValue(0);
  const stackY = useSharedValue(index * STACK_PEEK);
  const stackScale = useSharedValue(1 - index * STACK_SCALE_STEP);

  const exiting = React.useRef(false);
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
    [clearTimer, dragY, finishDismiss, onDismissStart, opacity, reduced, toast.id],
  );

  const restartTimer = React.useCallback(() => {
    if (exiting.current) return;
    clearTimer();
    timer.current = setTimeout(() => dismiss('timeout'), AUTO_DISMISS_MS);
  }, [clearTimer, dismiss]);

  const commitSwipeDismiss = React.useCallback(() => dismiss('swipe'), [dismiss]);

  React.useEffect(() => {
    progress.set(reduced ? 1 : withSpring(1));
    opacity.set(withTiming(1, { duration: FADE_IN_MS }));
    restartTimer();
    return clearTimer;
    // Arrival happens once, on mount, whatever else changes afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (exiting.current) return;
    const y = index * STACK_PEEK;
    const scale = 1 - index * STACK_SCALE_STEP;
    stackY.set(reduced ? y : withSpring(y));
    stackScale.set(reduced ? scale : withSpring(scale));
    // Deeper than the visible pile: fade out rather than draw a fourth card
    // nobody can read anyway.
    if (index >= MAX_VISIBLE) opacity.set(withTiming(0, { duration: FADE_IN_MS }));
  }, [index, opacity, reduced, stackScale, stackY]);

  /* eslint-disable react-hooks/refs -- `clearTimer` and `restartTimer` touch
     the timer ref, and the rule sees them being handed to the gesture during
     render. They are only ever CALLED from a gesture event, never from the
     render pass, which is the thing the rule exists to catch. The timer has to
     be a ref: it is cleared and restarted several times per gesture and none
     of that should draw a frame. */
  const pan = Gesture.Pan()
    // Only the front one is draggable. The pile behind it is a hint about how
    // many are queued, not a set of separate controls.
    .enabled(index === 0)
    .onBegin(() => {
      scheduleOnRN(clearTimer);
    })
    .onUpdate((e) => {
      // Up is the way out, so up tracks the finger exactly. Down is going
      // nowhere, so it resists.
      dragY.set(e.translationY <= 0 ? e.translationY : rubberBand(e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY < -DISMISS_DISTANCE || e.velocityY < -DISMISS_VELOCITY) {
        scheduleOnRN(commitSwipeDismiss);
      } else {
        dragY.set(withSpring(0));
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
        { translateY: -(1 - p) * ENTER_OFFSET + stackY.get() + dragY.get() },
        { scale: (HIDDEN_SCALE + (1 - HIDDEN_SCALE) * p) * stackScale.get() },
      ],
    };
  });

  const ActionIcon = toast.actionIcon;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[{ position: 'absolute', left: 16, right: 16, zIndex: 100 - index }, animatedStyle]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Card>
          <Card.Content className="flex-row items-center gap-3 p-3">
            {toast.tone === 'success' && (
              <CircleCheck size={18} color={asColor(success)} strokeWidth={2} />
            )}
            <Text
              numberOfLines={2}
              className="flex-1"
              style={{ fontFamily: fontFamily.sans, fontSize: 14, color: asColor(foreground) }}
            >
              {toast.message}
            </Text>
            {/* The action replaces the close rather than joining it: two icons
                on one line is the busy, uneven row this layout exists to
                avoid, and a swipe or the timer still dismisses either way. */}
            {ActionIcon && toast.actionLabel ? (
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={toast.actionLabel}
                onPress={() => {
                  toast.onActionPress?.();
                  dismiss('close');
                }}
              >
                <ActionIcon size={18} color={asColor(foreground)} />
              </Pressable>
            ) : (
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                onPress={() => dismiss('close')}
              >
                <X size={18} color={asColor(mutedForeground)} />
              </Pressable>
            )}
          </Card.Content>
        </Card>
      </Animated.View>
    </GestureDetector>
  );
}

/** The pile's own footprint, so the host can reserve room for it. */
export const TOAST_STACK_PEEK = STACK_PEEK;
