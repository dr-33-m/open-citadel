import React from 'react';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { Carousel, useCarouselState } from '@/components/ui/carousel';

const REST_SCALE = 1;
const AWAY_SCALE = 0.94;
const AWAY_OPACITY = 0.55;

/**
 * One slide of the plan run, with depth.
 *
 * The carousel's `default` variant is a plain track: every slide translates
 * and nothing else, which gives all three equal weight. That is right for
 * photographs and wrong for a choice - the card being decided on should be
 * the obvious one, and hierarchy is what makes the important thing obvious.
 *
 * The active slide rests at exactly 1 and the others shrink away from it. It
 * is never scaled ABOVE 1, and the carousel's own `interactive` branch
 * carries the reason: text is rasterised at its layout size and then scaled
 * by the compositor, so a price held at 1.05 is drawn at the wrong raster
 * size for the whole time it is readable.
 *
 * One animated node per slide, three slides. Transform and opacity only, on
 * the UI thread, off the same shared value the run already drives.
 */
export function PlanSlide({ index, children }: { index: number; children: React.ReactNode }) {
  const { progress } = useCarouselState();

  const animated = useAnimatedStyle(() => {
    const distance = Math.abs(index - progress.value);
    return {
      opacity: interpolate(distance, [0, 1], [1, AWAY_OPACITY], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(distance, [0, 1], [REST_SCALE, AWAY_SCALE], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Carousel.Item className="px-2">
      <Animated.View className="h-full w-full" style={animated}>
        {children}
      </Animated.View>
    </Carousel.Item>
  );
}
