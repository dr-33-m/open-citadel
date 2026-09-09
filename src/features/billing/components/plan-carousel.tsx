import React from 'react';
import { View, useWindowDimensions, type TextStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { PurchasesPackage } from 'react-native-purchases';

import { ActionButton } from '@/components/action-button';
import { ThemedText } from '@/components/themed-text';
import { Carousel } from '@/components/ui/carousel';
import { Spinner } from '@/components/ui/spinner';
import { GoldButton } from '@/components/ui/gold-button';
import { PLANS, type CreditPlan, type PlanId } from 'samwell-shared';
import { asColor } from '@/utils/colors';
import { haptics } from '@/utils/haptics';
import { PlanCard } from '@/features/billing/components/plan-card';
import { PlanSlide } from '@/features/billing/components/plan-slide';

/**
 * Every slide is absolutely positioned, so `Carousel.Content` has to be told
 * a height - it has no children in the layout flow to take one from. Same
 * constraint the Compass log deck documents.
 *
 * Sized to the card's own content now that the commit button lives below the
 * run rather than on each card: a taller box would just leave dead space at
 * the foot of all three.
 *
 * A base, not the answer. `allowFontScaling` is on by default, so six lines of
 * text measured at the default type size is the wrong height for somebody
 * running large text - and a fixed height does not clip gracefully, it just
 * cuts the last line off. Scaled by the live font scale below.
 */
const BASE_CARD_HEIGHT = 196;

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
  /** How many models each plan opens up. */
  modelCounts: Record<PlanId, number>;
  busy: PlanId | 'restore' | null;
  loading: boolean;
  error: string | null;
  onChoose: (plan: PlanId, packageToBuy: PurchasesPackage) => void;
  onRestore: () => void;
};

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
      // in the wrong currency is worse than a price shown a beat late.
      packages[plan.id]?.product.priceString ?? `$${plan.priceUsd}`,
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
        <Carousel.Content style={contentStyle}>
          {PLANS.map((plan, index) => (
            <PlanSlide key={plan.id} index={index}>
              <PlanCard
                plan={plan}
                modelCount={modelCounts[plan.id] ?? 0}
                priceLabel={priceFor(plan)}
                selected={index === active}
              />
            </PlanSlide>
          ))}
        </Carousel.Content>
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

      <View className="flex-row items-center justify-between">
        {/* Apple requires a way back to a purchase already made, and anybody
            reinstalling needs it whatever Apple thinks. */}
        {busy === 'restore' ? (
          <Spinner size="sm" label="Looking for your subscription" />
        ) : (
          <ActionButton
            label="RESTORE PURCHASES"
            tint={asColor(mutedForeground)}
            onPress={onRestore}
          />
        )}
        {loading ? <Spinner size="sm" label="Checking your plan" /> : null}
      </View>
    </View>
  );
}
