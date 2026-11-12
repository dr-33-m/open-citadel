import type { LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { easing, motion } from '@/constants/theme';
import { formatClock } from '@/features/podcasts/utils/format';
import { haptics } from '@/utils/haptics';

/** How much the track and thumb swell while a finger holds them. */
const HELD_TRACK_SCALE = 2;
const HELD_THUMB_SCALE = 1.45;

/**
 * The scrubber's gesture and every value it draws, all on the UI thread.
 *
 * Grabbed anywhere along its length, it follows the finger 1:1 from where it
 * was touched (a tap jumps there), and the track and thumb swell while held.
 * Horizontal only: a vertical drag is left to the player's drag-to-close.
 * The labels show the time at the thumb while dragging and the time left on
 * the right, because "how long until this ends" is what a listener asks.
 */
export function useScrubber(
  position: SharedValue<number>,
  duration: SharedValue<number>,
  onSeek: (seconds: number) => void,
  thumbSize: number,
  /** Off while the player is still opening: the scrubber draws, but takes no touches yet. */
  enabled: boolean,
) {
  const reduceMotion = useReducedMotion();
  const width = useSharedValue(0);
  const held = useSharedValue(0);
  const dragFraction = useSharedValue(0);
  const dragging = useSharedValue(false);

  const fraction = useDerivedValue(() => {
    if (dragging.get()) return dragFraction.get();
    const d = duration.get();
    return d > 0 ? Math.min(1, Math.max(0, position.get() / d)) : 0;
  });
  // No numbers while the length is not known (a book still being read), rather
  // than 0:00 and then the real ones.
  const elapsedText = useDerivedValue(() => (duration.get() > 0 ? formatClock(fraction.get() * duration.get()) : ''));
  const remainingText = useDerivedValue(() => (duration.get() > 0 ? `-${formatClock(duration.get() * (1 - fraction.get()))}` : ''));

  const grab = (x: number) => {
    'worklet';
    const w = width.get();
    dragFraction.set(w > 0 ? Math.min(1, Math.max(0, x / w)) : 0);
  };
  const letGo = () => {
    'worklet';
    dragging.set(false);
    held.set(withTiming(0, { duration: motion.base, easing }));
  };
  const release = () => {
    'worklet';
    const target = dragFraction.get() * duration.get();
    // The clock jumps to where the finger let go, so the thumb does not snap
    // back to the old position for the moment before the player catches up.
    position.set(target);
    letGo();
    scheduleOnRN(onSeek, target);
  };

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart((e) => {
      dragging.set(true);
      grab(e.x);
      held.set(withTiming(1, { duration: reduceMotion ? 0 : motion.fast, easing }));
      scheduleOnRN(haptics.select);
    })
    .onUpdate((e) => grab(e.x))
    .onEnd(() => release())
    .onFinalize((_e, success) => {
      if (!success && dragging.get()) letGo();
    });
  const tap = Gesture.Tap()
    .enabled(enabled)
    .onEnd((e) => {
      dragging.set(true);
      grab(e.x);
      release();
    });

  const trackStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + held.get() * (HELD_TRACK_SCALE - 1) }] }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fraction.get() }] }));
  const thumbStyle = useAnimatedStyle(() => ({
    // Hidden until the track has been measured, or it would draw at the
    // start for a frame and then jump to where the episode is.
    opacity: width.get() > 0 ? 1 : 0,
    transform: [
      { translateX: fraction.get() * width.get() - thumbSize / 2 },
      { scale: 1 + held.get() * (HELD_THUMB_SCALE - 1) },
    ],
  }));

  return {
    gesture: Gesture.Exclusive(pan, tap),
    onLayout: (e: LayoutChangeEvent) => width.set(e.nativeEvent.layout.width),
    elapsedText,
    remainingText,
    trackStyle,
    fillStyle,
    thumbStyle,
  };
}
