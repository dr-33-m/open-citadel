import React from 'react';
import { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { easing, motion } from '@/constants/theme';

/**
 * A transcript line's opacity, eased on the UI thread when the line being
 * spoken moves on: the old line steps back as the new one comes up, the way
 * lyrics do. A row the list recycles for another line takes its new opacity
 * at once, so nothing fades in that was never on screen.
 */
export function useLineFade(index: number, opacity: number) {
  const shown = useSharedValue(opacity);
  const drawn = React.useRef(index);

  React.useEffect(() => {
    if (drawn.current !== index) {
      drawn.current = index;
      shown.set(opacity);
      return;
    }
    shown.set(withTiming(opacity, { duration: motion.slow, easing, reduceMotion: ReduceMotion.System }));
  }, [index, opacity, shown]);

  return useAnimatedStyle(() => ({ opacity: shown.get() }));
}
