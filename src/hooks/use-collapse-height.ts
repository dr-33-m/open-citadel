import React from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { motion } from '@/constants/theme';

/**
 * A body that opens and closes by animating its own measured height.
 *
 * Height cannot animate from `auto`, so the content is measured and the number
 * is what gets animated to. Both values come back as shared values, so the
 * caller composes its own style — one wants height alone, another wants height
 * and a negative margin — and none of it crosses to the JS thread.
 *
 * ## Why not PanelUI's `Collapse`
 *
 * `Collapse` takes its content out of the flow while animating and puts it
 * back at the end, which is the right call for a body that holds another
 * `Collapse` or content still streaming in. The cost is a layout switch on
 * every open and a first measurement that can land mid-flight: the Samwell tip
 * animated from zero to zero on its first tap, took its height while that was
 * happening, and jumped. Every open after that was smooth, because by then the
 * number was known — which is exactly the shape of "janky the first time".
 *
 * Here the content is absolutely positioned in both states and never returns
 * to the flow, so there is no switch and nothing to re-measure. That is only
 * safe because these bodies are fixed content that nothing nests inside.
 *
 * The first measurement is applied outright and later ones are animated: there
 * is nothing on screen to animate from the first time, and a body whose
 * contents change while open should travel rather than jump.
 */
export function useCollapseHeight(open: boolean): {
  progress: SharedValue<number>;
  height: SharedValue<number>;
  onLayout: (event: LayoutChangeEvent) => void;
} {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(open ? 1 : 0);
  const height = useSharedValue(0);
  /** The last measurement, on the JS side, so `onLayout` can ignore noise. */
  const measured = React.useRef(0);

  React.useEffect(() => {
    progress.value = reducedMotion
      ? withTiming(open ? 1 : 0, { duration: motion.fast })
      : withTiming(open ? 1 : 0, {
          duration: motion.base,
          easing: Easing.out(Easing.cubic),
        });
  }, [open, progress, reducedMotion]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (Math.abs(measured.current - next) < 1) return;
    const first = measured.current === 0;
    measured.current = next;
    height.value =
      first || reducedMotion
        ? next
        : withTiming(next, { duration: motion.base, easing: Easing.out(Easing.cubic) });
  };

  return { progress, height, onLayout };
}
