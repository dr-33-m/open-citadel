import React from 'react';
import { View, useWindowDimensions, type TextStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import type { PurchasesPackage } from 'react-native-purchases';

import { ThemedText } from '@/components/themed-text';
import { ROW_FADE } from '@/components/scroll-fades';
import { ScrollFade } from '@/components/ui/scroll-fade';
import { Carousel, useCarouselState } from '@/components/ui/carousel';
import { Spinner } from '@/components/ui/spinner';
import { GoldButton } from '@/components/ui/gold-button';
import { Touchable } from '@/components/ui/touchable';
import { CREDIT_PLANS, PLANS, type CreditPlan, type PlanId } from 'samwell-shared';
import { asColor } from '@/utils/colors';
import { haptics } from '@/utils/haptics';
import { formatStorePrice } from '@/features/billing/utils/price';
import { PlanCard } from '@/features/billing/components/plan-card';
import { PlanInfoSheet } from '@/features/billing/components/plan-info-sheet';
import { PlanSlide } from '@/features/billing/components/plan-slide';
import type { PlanModel } from '@/stores/subscription';

/**
 * Every slide is absolutely positioned, so `Carousel.Content` has to be told
 * a height - it has no children in the layout flow to take one from. Same
 * constraint the Compass log deck documents.
 *
 * The number is the tallest card's content, summed from the theme's tokens so
 * it can be checked rather than believed. Two rows wrap and the sum holds
 * them: "6 models to choose from" runs to two lines at the tick row's width
 * (seen on device), and the Grand Maester name takes two beside the badge:
 *
 *   32  `p-4`, top and bottom
 *   40  title row - the Grand Maester name's two `bodySm` lines
 *   16  gap-4
 *   36  price row (`headlineLg`'s line)
 *   16  gap-4
 *   24  credits row (`bodyMd`'s line)
 *  + 8 + 40 + 8 + 20   models on two lines, then rollover, with `gap-2`
 *   16  `p-4` bottom
 *    2  the card's own 1px borders
 *  ────
 *  242
 *
 * A base, not the answer. `allowFontScaling` is on by default, so lines
 * measured at the default type size is the wrong height for somebody running
 * large text - and a fixed height does not clip gracefully, it just cuts the
 * last line off. Scaled by the live font scale below.
 */
const BASE_CARD_HEIGHT = 242;

/**
 * Past double, scaling the box further stops helping.
 *
 * The card would be taller than most screens and the run would have nothing
 * left to peek. Two lines of the copy wrapping inside a box this tall is a
 * far better outcome than a card nobody can swipe past.
 */
const MAX_FONT_SCALE = 2;

/** Under the panel width, so the neighbours peek. The peek is what says
 * there are two more. */
const CARD_WIDTH = 232;

const SMALL: TextStyle = { fontSize: 11 };

/** Grand Maester, the middle of a run of three and the plan the app is named
 * around. */
const DEFAULT_INDEX = 1;



export type PlanCarouselProps = {
  /** Store packages keyed by plan, or empty while the offering loads. */
  packages: Partial<Record<PlanId, PurchasesPackage>>;
  /** The whole catalogue with tiers and credit estimates, for the info
   * sheets. Empty against an older server; the sheets then say counts. */
  catalogue: PlanModel[];
  /** How many models each plan opens up. */
  modelCounts: Record<PlanId, number>;
  busy: PlanId | 'restore' | null;
  loading: boolean;
  error: string | null;
  onChoose: (plan: PlanId, packageToBuy: PurchasesPackage) => void;
  onRestore: () => void;
};

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
function CarouselEdgeFade({ children }: { children: React.ReactNode }) {
  const { progress, count } = useCarouselState();
  // Seeded for the run's resting index, so the first frame is already
  // correct and the reaction only ever maintains it.
  const start = useSharedValue(DEFAULT_INDEX * CARD_WIDTH);
  const end = useSharedValue((PLANS.length - 1 - DEFAULT_INDEX) * CARD_WIDTH);

  useAnimatedReaction(
    () => progress.get(),
    (p) => {
      start.set(p * CARD_WIDTH);
      end.set(Math.max(0, count - 1 - p) * CARD_WIDTH);
    },
  );

  return (
    <ScrollFade orientation="horizontal" edges="both" size={ROW_FADE} distance={{ start, end }}>
      {children}
    </ScrollFade>
  );
}

/**
 * The three plans, as a run of cards.
 *
 * `variant="default"` on purpose: it is the plain track, and the docs call it
 * the honest choice for content that is read rather than admired. Three
 * prices are read. `interactive` and `coverflow` rotate their slides, which
 * tilts a price and a button off-axis - a purchase decision is not a shelf of
 * album art.
 *
 * No scroll fade. Every scrollable in the app carries one except a carousel,
 * where the peeking neighbour is already the affordance.
 */
export function PlanCarousel({
  packages,
  catalogue,
  modelCounts,
  busy,
  loading,
  error,
  onChoose,
  onRestore,
}: PlanCarouselProps) {
  const [mutedForeground, destructive] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive',
  ]);
  const [active, setActive] = React.useState(DEFAULT_INDEX);
  /** Which plan's explanation sheet is open, if any. One sheet, three keys. */
  const [infoPlanId, setInfoPlanId] = React.useState<PlanId | null>(null);
  // Reactive rather than read once: the setting can change while the app is
  // open, and `PixelRatio.getFontScale()` at module load would never notice.
  const { fontScale } = useWindowDimensions();
  const contentStyle = React.useMemo(
    () => ({ height: Math.round(BASE_CARD_HEIGHT * Math.min(Math.max(1, fontScale), MAX_FONT_SCALE)) }),
    [fontScale],
  );

  /*
   * The snap is a selection moving, which is what the house reserves
   * `select` for. It fires on the settled index rather than during the drag,
   * so the buzz lands with the card arriving and not under the finger.
   */
  const handleIndexChange = React.useCallback((next: number) => {
    setActive(next);
    haptics.select();
  }, []);

  const choose = React.useCallback(
    (plan: PlanId) => {
      const packageToBuy = packages[plan];
      if (!packageToBuy) return;
      haptics.commit();
      onChoose(plan, packageToBuy);
    },
    [packages, onChoose],
  );

  const priceFor = React.useCallback(
    (plan: CreditPlan) =>
      // The store's own localised string when it is known, and the plan's own
      // number only as a placeholder while the offering loads. A price shown
      // in the wrong currency is worse than a price shown a beat late. The
      // string then loses its country qualifier and its exactly-zero cents:
      // "$20", not "US$20.00" - see `formatStorePrice`.
      formatStorePrice(packages[plan.id]?.product.priceString ?? `$${plan.priceUsd}`),
    [packages],
  );

  const nothingToBuy = Object.keys(packages).length === 0;
  // The run is bounded to three, but an index arriving from a gesture is not
  // something to take on trust when it indexes an array.
  const activePlan = PLANS[Math.min(Math.max(0, active), PLANS.length - 1)];

  return (
    <View className="gap-4">
      <Carousel
        variant="default"
        align="center"
        itemSize={CARD_WIDTH}
        defaultIndex={DEFAULT_INDEX}
        onIndexChange={handleIndexChange}
      >
        <CarouselEdgeFade>
          <Carousel.Content style={contentStyle}>
            {PLANS.map((plan, index) => (
              <PlanSlide key={plan.id} index={index}>
                <PlanCard
                  plan={plan}
                  modelCount={modelCounts[plan.id] ?? 0}
                  priceLabel={priceFor(plan)}
                  selected={index === active}
                  onInfo={() => setInfoPlanId(plan.id)}
                />
              </PlanSlide>
            ))}
          </Carousel.Content>
        </CarouselEdgeFade>
        <Carousel.Dots className="mt-4 self-center" />
      </Carousel>

      {/* One commit, in a fixed place, naming what it will buy. Gold appears
          once per screen and never moves; the run is what selects. A label
          that says which plan is also the difference between a button a
          screen reader can announce and three that all say "choose". */}
      <GoldButton
        label={`CHOOSE ${activePlan.label.toUpperCase()}`}
        size="full"
        loading={busy === activePlan.id}
        disabled={nothingToBuy || busy !== null}
        onPress={() => choose(activePlan.id)}
      />

      {error ? (
        <ThemedText type="bodySm" color={asColor(destructive)} style={SMALL}>
          {error}
        </ThemedText>
      ) : null}

      {/*
       * Restore, as Apple draws it on its own subscription screens: a quiet,
       * centred text row. The bordered chip treatment competed with the gold
       * commit above it for weight, and a secondary escape hatch must not
       * out-shout the thing it sits under. Press feedback and the haptic stay
       * - quiet is not inert (§1, §13). The two waits land below the row, on
       * its own line, so their comings and goings never move the centred
       * label a pixel.
       */}
      <View className="items-center">
        <Touchable
          className="px-4 py-2"
          onPress={onRestore}
          disabled={busy !== null}
          haptic="select"
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
        >
          <ThemedText
            type="labelSm"
            color={asColor(mutedForeground)}
            className="tracking-[1px]"
          >
            RESTORE PURCHASES
          </ThemedText>
        </Touchable>
      </View>
      {busy === 'restore' || loading ? (
        <View className="items-center">
          <Spinner
            size="sm"
            label={busy === 'restore' ? 'Looking for your subscription' : 'Checking your plan'}
          />
        </View>
      ) : null}

      {/*
       * One sheet for the run. It opens on the card whose mark was tapped,
       * not on the resting card - a neighbour's i is a neighbour's question.
       */}
      {infoPlanId ? (
        <PlanInfoSheet
          visible
          onClose={() => setInfoPlanId(null)}
          plan={CREDIT_PLANS[infoPlanId]}
          models={catalogue}
          modelCount={modelCounts[infoPlanId] ?? 0}
        />
      ) : null}
    </View>
  );
}
