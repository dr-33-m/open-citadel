import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';

/** How far down the beat dips. */
const FLOOR = 0.4;
/** One half of the cycle — down, then back up. */
const HALF_CYCLE = 800;

/**
 * A slow opacity heartbeat for a control that is busy: the power button while
 * an engine loads, the chat action while its request is in flight.
 *
 * Reanimated rather than core `Animated`, because the loop this replaces was
 * driven from the JS thread — the same thread doing the work the pulse is
 * reporting on, so it stalled exactly when it had something to say. This one
 * runs on the UI thread and keeps beating through the load.
 *
 * It stops under Reduce Motion and holds at full opacity. A heartbeat is never
 * the only signal that something is happening — the control is disabled, and
 * there is a spinner or a label beside it — so dropping the movement drops
 * nothing the user needed.
 *
 * The animation is cancelled on unmount as well as when `active` goes false:
 * an infinite `withRepeat` left running is a mapper writing to a view that no
 * longer exists.
 */
export function usePulse(active: boolean): AnimatedStyle<{ opacity: number }> {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!active || reducedMotion) {
      cancelAnimation(opacity);
      opacity.set(withTiming(1, { duration: 150 }));
      return undefined;
    }

    opacity.set(
      withRepeat(
        withTiming(FLOOR, { duration: HALF_CYCLE, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );

    return () => cancelAnimation(opacity);
  }, [active, reducedMotion, opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.get() }));
}
