import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/lib/cn';

/** Milliseconds for one half of the pulse. */
const PULSE_DURATION = 700;
/** How far down the pulse goes. */
const PULSE_FLOOR = 0.45;
/** Where the pulse rests when it is not running. */
const RESTING_OPACITY = 0.7;

/**
 * One pulse for a whole placeholder, instead of one per bar.
 *
 * This exists because the obvious construction — a `Skeleton` per bar, each
 * animating itself — is what made the drawers slow. A placeholder list is
 * twenty-odd bars, and `Skeleton` builds a shared value, an animated style and
 * an infinite `withRepeat` for every one of them. Measured on an A33, the chat
 * history placeholder cost **950ms** of the 1385ms between its sheet opening
 * and its content arriving; the same sheet behind a static view took 434ms. The
 * placeholder was not covering the wait, it *was* the wait.
 *
 * Driving one animated node and letting the bars be plain views collapses that
 * to a single mapper. It also looks better: the whole placeholder breathing
 * together reads as one surface waiting, where independent bars read as a
 * chart. Use `SkeletonBar` for the shapes inside it.
 *
 * `Skeleton` in `ui/` is still right for a lone placeholder — one bar, one
 * animation, nothing to amortise.
 */
export function SkeletonGroup({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /**
   * What is loading, announced once for the whole placeholder. A screen of
   * bars should say one thing, not twenty.
   */
  label?: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(reducedMotion ? RESTING_OPACITY : 1);

  useEffect(() => {
    if (reducedMotion) {
      opacity.set(RESTING_OPACITY);
      return undefined;
    }
    opacity.set(
      withRepeat(
        withTiming(PULSE_FLOOR, {
          duration: PULSE_DURATION,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  const announced = label != null;

  return (
    <Animated.View
      accessibilityRole={announced ? 'progressbar' : undefined}
      accessibilityLabel={label}
      accessibilityState={announced ? { busy: true } : undefined}
      accessibilityElementsHidden={!announced}
      importantForAccessibility={announced ? 'auto' : 'no-hide-descendants'}
      style={style}
      className={className}
    >
      {children}
    </Animated.View>
  );
}

/**
 * One shape inside a `SkeletonGroup`. A plain view on purpose — the group above
 * it owns the animation, and that is the whole point of the split.
 */
export function SkeletonBar({ className }: { className?: string }) {
  return <View className={cn('rounded-md bg-skeleton', className)} />;
}
