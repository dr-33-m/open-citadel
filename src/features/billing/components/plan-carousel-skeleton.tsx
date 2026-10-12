import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';
import { Card } from '@/components/ui/card';
import { AWAY_OPACITY, AWAY_SCALE } from '@/features/billing/components/plan-slide';

/** The dimmed look of a card the run is not resting on. See `PlanSlide`. */
const AWAY: ViewStyle = { opacity: AWAY_OPACITY, transform: [{ scale: AWAY_SCALE }] };

/** One plan card's outline: the rows `PlanCard` draws, at their sizes. */
function PlanCardBones() {
  return (
    <Card className="h-full gap-4 p-4">
      <View className="flex-row items-center gap-3">
        <SkeletonBar className="h-9 w-9 rounded-none" />
        <SkeletonBar className="h-4 w-28" />
      </View>
      <View className="flex-row items-end gap-2">
        <SkeletonBar className="h-8 w-20" />
        <SkeletonBar className="mb-1 h-3 w-12" />
      </View>
      <View className="gap-3">
        <SkeletonBar className="h-4 w-32" />
        <SkeletonBar className="h-3 w-40" />
        <SkeletonBar className="h-3 w-36" />
        <SkeletonBar className="h-3 w-32" />
      </View>
    </Card>
  );
}

/**
 * The plan run before it is drawn: a card outline where each card will be,
 * the resting one in place and its neighbours peeking, dimmed, exactly as the
 * run draws them, then the dots.
 *
 * The same geometry is the point. When the cards arrive they dissolve in over
 * this without a single edge moving, so the eye reads one surface filling in
 * rather than one thing being swapped for another. One pulse for the whole
 * run, for the reason `SkeletonGroup` gives.
 */
export function PlanCarouselSkeleton({
  cardWidth,
  height,
  count = 3,
  resting = 1,
}: {
  cardWidth: number;
  /** The run's content height, which the carousel scales with font size. */
  height: number;
  /** How many cards the run will hold. A plan change offers fewer than three. */
  count?: number;
  /** The card the run opens on, which sits in the middle of the screen. */
  resting?: number;
}) {
  const cards = React.useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  // The row is centred as a whole; shifted so the resting card is the one in
  // the middle, as the run's own centre alignment puts it.
  const row = React.useMemo<ViewStyle>(
    () => ({ transform: [{ translateX: ((count - 1) / 2 - resting) * cardWidth }] }),
    [cardWidth, count, resting],
  );
  const slide = React.useMemo<ViewStyle>(() => ({ width: cardWidth, height }), [cardWidth, height]);

  return (
    <SkeletonGroup label="Loading plans">
      {/* Wider than the screen and centred, so the neighbours overflow both
          edges the way the real run's do. */}
      <View className="overflow-hidden">
        <View className="flex-row justify-center" style={row}>
          {cards.map((index) => (
            <View key={index} className="px-2" style={slide}>
              <View className="h-full w-full" style={index === resting ? undefined : AWAY}>
                <PlanCardBones />
              </View>
            </View>
          ))}
        </View>
      </View>
      {/* The dots, as `CarouselDots` draws them: a 24-tall row of square
          dots twelve apart, the resting one a bar. */}
      <View className="mt-4 h-6 flex-row items-center self-center">
        {cards.map((dot) => (
          <View key={dot} className="h-6 w-3 items-center justify-center">
            <View className={dot === resting ? 'h-1.5 w-3.5 bg-skeleton' : 'h-1.5 w-1.5 bg-skeleton'} />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}
