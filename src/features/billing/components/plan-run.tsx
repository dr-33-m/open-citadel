import React from "react";
import type { ViewStyle } from "react-native";
import { useAnimatedReaction, useSharedValue } from "react-native-reanimated";

import {
    ROW_FADE,
    useFadeColor,
    type FadeSurface,
} from "@/components/scroll-fades";
import { CarouselDots } from "@/components/carousel-dots";
import { Carousel, useCarouselState } from "@/components/ui/carousel";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { PlanCard } from "@/features/billing/components/plan-card";
import { PlanSlide } from "@/features/billing/components/plan-slide";
import type { CreditPlan, PlanId, VoiceFigures } from "samwell-shared";

/**
 * The scroll fades, driven by the run itself.
 *
 * The carousel is not a ScrollView, so `ScrollFade`'s own scroll handler has
 * nothing to listen to; the `distance` path hands over the two edge
 * distances as shared values instead, derived from the same `progress` the
 * slides are animated from - one value, one truth, UI thread end to end.
 * Rubber-banding past either end drives `progress` out of range, which
 * clamps to no fade at that edge: there is genuinely nothing behind it.
 *
 * Depth is `ROW_FADE`, the shelf depth, because the ask here is consistency
 * with every other edge in the app - the cards are wider than book covers,
 * but a second depth number would be a second decision.
 */
function CarouselEdgeFade({
  children,
  initialIndex,
  cardWidth,
  surface,
}: {
  children: React.ReactNode;
  initialIndex: number;
  cardWidth: number;
  surface: FadeSurface;
}) {
  const { progress, count } = useCarouselState();
  const color = useFadeColor(surface);
  // Seeded for the run's resting index, so the first frame is already
  // correct and the reaction only ever maintains it.
  const start = useSharedValue(initialIndex * cardWidth);
  const end = useSharedValue((count - 1 - initialIndex) * cardWidth);

  useAnimatedReaction(
    () => progress.get(),
    (p) => {
      start.set(p * cardWidth);
      end.set(Math.max(0, count - 1 - p) * cardWidth);
    },
  );

  return (
    <ScrollFade
      orientation="horizontal"
      edges="both"
      size={ROW_FADE}
      color={color}
      distance={{ start, end }}
    >
      {children}
    </ScrollFade>
  );
}

/**
 * The plans, as a run of cards with its dots.
 *
 * `variant="default"` on purpose: it is the plain track, and the docs call it
 * the honest choice for content that is read rather than admired. Three
 * prices are read. `interactive` and `coverflow` rotate their slides, which
 * tilts a price and a button off-axis - a purchase decision is not a shelf of
 * album art.
 *
 * This is the expensive part of the plan picker: a gesture, the track, three
 * animated slides and the edge fades. It is its own component so that
 * `PlanCarousel` can hold it back behind the skeleton until the frame the
 * reader tapped on has been drawn, and memoized so a purchase starting (which
 * only changes the button) does not draw the cards again.
 */
export const PlanRun = React.memo(function PlanRun({
  plans,
  initialIndex,
  active,
  cardWidth,
  contentStyle,
  prices,
  modelCounts,
  voicesByPlan,
  surface,
  onIndexChange,
  onInfo,
}: {
  plans: CreditPlan[];
  /** The card the run rests on when it opens. */
  initialIndex: number;
  /** The card it rests on now. */
  active: number;
  cardWidth: number;
  /** The track's height: its slides are absolute, so it has to be told. */
  contentStyle: ViewStyle;
  /** The store's own price for each plan. A missing one draws as waiting. */
  prices: Partial<Record<PlanId, string>>;
  modelCounts: Record<PlanId, number>;
  voicesByPlan: VoiceFigures["byPlan"] | null;
  surface: FadeSurface;
  onIndexChange: (index: number) => void;
  onInfo: (plan: PlanId) => void;
}) {
  return (
    <Carousel
      variant="default"
      align="center"
      itemSize={cardWidth}
      defaultIndex={initialIndex}
      onIndexChange={onIndexChange}
    >
      <CarouselEdgeFade
        initialIndex={initialIndex}
        cardWidth={cardWidth}
        surface={surface}
      >
        <Carousel.Content style={contentStyle}>
          {plans.map((plan, index) => (
            <PlanSlide key={plan.id} index={index}>
              <PlanCard
                plan={plan}
                modelCount={modelCounts[plan.id] ?? 0}
                readingHours={voicesByPlan?.[plan.id]?.hours ?? null}
                priceLabel={prices[plan.id] ?? null}
                selected={index === active}
                onInfo={() => onInfo(plan.id)}
              />
            </PlanSlide>
          ))}
        </Carousel.Content>
      </CarouselEdgeFade>
      {/* The same dots as the voices: square, with one gold bar. */}
      <CarouselDots className="mt-4 self-center" label="Plan" />
    </Carousel>
  );
});
