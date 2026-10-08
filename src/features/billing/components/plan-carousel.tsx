import React from "react";
import { View, useWindowDimensions } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useCSSVariable } from "uniwind";

import { Handover } from "@/components/navigation/handover";
import { ThemedText } from "@/components/themed-text";
import { GoldButton } from "@/components/ui/gold-button";
import { Spinner } from "@/components/ui/spinner";
import { Touchable } from "@/components/ui/touchable";
import { PlanCarouselSkeleton } from "@/features/billing/components/plan-carousel-skeleton";
import { PlanOfferFailed } from "@/features/billing/components/plan-offer-failed";
import { PlanInfoSheet } from "@/features/billing/components/plan-info-sheet";
import { PlanRun } from "@/features/billing/components/plan-run";
import { SubscriptionLegalLinks } from "@/features/billing/components/subscription-legal-links";
import { PLAN_ICON } from "@/features/billing/utils/plan-icon";
import { formatStorePrice } from "@/features/billing/utils/price";
import type { PlanModel } from "@/stores/subscription";
import { asColor } from "@/utils/colors";
import { haptics } from "@/utils/haptics";
import {
    CREDIT_PLANS,
    PLANS,
    type CreditPlan,
    type PlanId,
    type VoiceFigures,
} from "samwell-shared";

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
 *  + 8 + 20   hours of cloud reading, one line, with `gap-2`
 *   16  `p-4` bottom
 *    2  the card's own 1px borders
 *  ────
 *  270
 *
 * A base, not the answer. `allowFontScaling` is on by default, so lines
 * measured at the default type size is the wrong height for somebody running
 * large text - and a fixed height does not clip gracefully, it just cuts the
 * last line off. Scaled by the live font scale below.
 */
const BASE_CARD_HEIGHT = 270;

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

export type PlanCarouselProps = {
  /** Store packages keyed by plan, or empty while the offering loads. */
  packages: Partial<Record<PlanId, PurchasesPackage>>;
  /** The whole catalogue with tiers and credit estimates, for the info
   * sheets. Empty against an older server; the sheets then say counts. */
  catalogue: PlanModel[];
  /** How many models each plan opens up. */
  modelCounts: Record<PlanId, number>;
  /** The reading voices each plan reaches, with the hours its default gives. Absent from an older server. */
  voicesByPlan?: VoiceFigures["byPlan"] | null;
  busy: PlanId | "restore" | "manage" | null;
  /**
   * Everything the cards say is in hand. Until then the run is its skeleton,
   * so the cards arrive whole rather than filling in piece by piece. See
   * `usePlanOffer`. The skeleton is also what is drawn first when this is
   * true from the start: see the note on `PlanCarousel`.
   */
  ready?: boolean;
  /**
   * The caller builds this ahead of the press that shows it (the cloud panel,
   * kept hidden until chosen), so with the prices in hand the run needs no
   * placeholder. Without it the run mounts behind its skeleton for a few
   * frames, so that its mount does not hold up the press that asked for it.
   */
  prebuilt?: boolean;
  /** The prices could not be had. The run gives way to a way to ask again. */
  failed?: boolean;
  onRetry?: () => void;
  onChoose: (plan: PlanId, packageToBuy: PurchasesPackage) => void;
  onSelectionChange?: (plan: PlanId) => void;
  onRestore?: () => void;
  /** A subset for plan changes. The initial purchase flow shows all plans. */
  plans?: CreditPlan[];
  /** The card the run rests on when it opens. */
  initialPlanId?: PlanId;
  /** Upgrade sheets do not repeat the restore escape hatch. */
  showRestore?: boolean;
  /** Plan-change sheets pin their action outside the scrolling region. */
  showAction?: boolean;
  /** The verb alone: the plan is named by its mark beside it. */
  actionVerb?: "CHOOSE" | "UPGRADE" | "DOWNGRADE";
  /** The ground the edge fades blend into. Sheets are `popover`. */
  surface?: "background" | "popover";
  /**
   * The gutter of the page the run sits in. The track reaches past it to the
   * screen edge, so the fade starts at the edge rather than a gutter inside
   * it; the button and restore row stay in the column.
   */
  bleed?: number;
};

/**
 * The plans on sale: the run of cards, the one commit under it, and the way
 * to restore.
 *
 * The run itself is `PlanRun`, the one expensive thing here: a gesture, a
 * track, three animated slides and their edge fades.
 *
 * Mounted in the same pass as a press, it holds up the frame that answers
 * the press, so by default it sits behind its skeleton for a few frames and
 * dissolves in over it, its edges where the skeleton's are.
 *
 * `prebuilt` drops that when the prices are already in hand, which is the
 * usual case (they are asked for ahead: see `usePlanOffer`). In Settings the
 * placeholder was seen as the plans loading again on every visit when nothing
 * was being loaded; the cloud panel is built ahead of the press and kept
 * instead (`KeptAlive`), so there the run is simply drawn. A real wait, the
 * store not having answered yet, still draws the skeleton.
 *
 * The edge fades blend into `surface` and start at the screen edge only when
 * `bleed` cancels the page gutter.
 */
/** The run, behind its placeholder only when it had to wait for the store. */
function PlanRunSlot({
  waited,
  ready,
  surface,
  skeleton,
  children,
}: {
  waited: boolean;
  ready: boolean;
  surface: "background" | "popover";
  skeleton: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!waited) return <>{children}</>;
  return (
    <Handover fill={false} ready={ready} surface={surface} skeleton={skeleton}>
      {children}
    </Handover>
  );
}

export function PlanCarousel({
  packages,
  catalogue,
  modelCounts,
  voicesByPlan = null,
  busy,
  ready = true,
  prebuilt = false,
  failed = false,
  onRetry,
  onChoose,
  onSelectionChange,
  onRestore,
  plans = PLANS,
  initialPlanId = "grand_maester",
  showRestore = true,
  showAction = true,
  actionVerb = "CHOOSE",
  surface = "popover",
  bleed = 0,
}: PlanCarouselProps) {
  const mutedForeground = useCSSVariable("--color-muted-foreground");
  const initialIndex = Math.max(
    0,
    plans.findIndex((plan) => plan.id === initialPlanId),
  );
  const [active, setActive] = React.useState(initialIndex);
  /** Which plan's explanation sheet is open, if any. One sheet, three keys. */
  const [infoPlanId, setInfoPlanId] = React.useState<PlanId | null>(null);
  // Reactive rather than read once: the setting can change while the app is
  // open, and `PixelRatio.getFontScale()` at module load would never notice.
  const { fontScale } = useWindowDimensions();
  const contentStyle = React.useMemo(
    () => ({
      height: Math.round(
        BASE_CARD_HEIGHT * Math.min(Math.max(1, fontScale), MAX_FONT_SCALE),
      ),
    }),
    [fontScale],
  );

  /*
   * The snap is a selection moving, which is what the house reserves
   * `select` for. It fires on the settled index rather than during the drag,
   * so the buzz lands with the card arriving and not under the finger.
   */
  const handleIndexChange = React.useCallback(
    (next: number) => {
      setActive(next);
      const nextPlan = plans[next];
      if (nextPlan) onSelectionChange?.(nextPlan.id);
      haptics.select();
    },
    [onSelectionChange, plans],
  );

  const choose = React.useCallback(
    (plan: PlanId) => {
      const packageToBuy = packages[plan];
      if (!packageToBuy) return;
      haptics.commit();
      onChoose(plan, packageToBuy);
    },
    [packages, onChoose],
  );

  /*
   * The store's own localised string for each plan, or nothing at all.
   *
   * It used to fall back to the plan's own `priceUsd` while the offering
   * loaded, which drew a real-looking price that nobody was being charged:
   * wrong currency outside the US, and wrong everywhere the moment a store
   * price changes, since that constant is only what the product was set up
   * as. A card with no price shows a waiting shimmer instead, and the CHOOSE
   * button is already disabled until the packages arrive, so no purchase can
   * start from a price that was never quoted.
   *
   * The string loses its country qualifier and its exactly-zero cents: "$20",
   * not "US$20.00" - see `formatStorePrice`.
   */
  const prices = React.useMemo(() => {
    const out: Partial<Record<PlanId, string>> = {};
    for (const plan of plans) {
      const priceString = packages[plan.id]?.product.priceString;
      if (priceString) out[plan.id] = formatStorePrice(priceString);
    }
    return out;
  }, [packages, plans]);

  const bleedStyle = React.useMemo(
    () => ({ marginHorizontal: -bleed }),
    [bleed],
  );
  const columnStyle = React.useMemo(
    () => ({ marginHorizontal: bleed }),
    [bleed],
  );
  // The prices could not be had and are not being asked for again.
  const offerFailed = failed && !ready;
  // Latched at mount: a run that had to wait keeps its placeholder through
  // the dissolve, and one that never waited never has one.
  const [waited] = React.useState(!ready || !prebuilt);

  const nothingToBuy = Object.keys(packages).length === 0;
  // The run is bounded to three, but an index arriving from a gesture is not
  // something to take on trust when it indexes an array.
  const activePlan =
    plans[Math.min(Math.max(0, active), plans.length - 1)] ?? PLANS[0];

  return (
    <View className="gap-4">
      <View style={bleedStyle}>
        {offerFailed ? (
          // In the column rather than bled to the screen edges.
          <View style={columnStyle}>
            <PlanOfferFailed onRetry={onRetry} />
          </View>
        ) : (
          <PlanRunSlot
            waited={waited}
            ready={ready}
            surface={surface}
            skeleton={
              <PlanCarouselSkeleton
                cardWidth={CARD_WIDTH}
                height={contentStyle.height}
                count={plans.length}
                resting={initialIndex}
              />
            }
          >
            <PlanRun
              plans={plans}
              initialIndex={initialIndex}
              active={active}
              cardWidth={CARD_WIDTH}
              contentStyle={contentStyle}
              prices={prices}
              modelCounts={modelCounts}
              voicesByPlan={voicesByPlan}
              surface={surface}
              onIndexChange={handleIndexChange}
              onInfo={setInfoPlanId}
            />
          </PlanRunSlot>
        )}
      </View>

      {/* One commit, in a fixed place. Gold appears once per screen and never
          moves; the run is what selects. The button carries the resting
          card's own mark and the verb, not the plan's name a second time:
          the name is on the card straight above it, and the mark changing
          with the run is what ties the two together. Leading, since a
          trailing mark on a button reads as "this goes somewhere". A screen
          reader still hears which plan, so the three never all say "choose". */}
      {showAction ? (
        <View>
          <GoldButton
            label={actionVerb}
            icon={PLAN_ICON[activePlan.id]}
            accessibilityLabel={`${actionVerb} ${activePlan.label}`}
            size="compact"
            loading={busy === activePlan.id}
            disabled={nothingToBuy || busy !== null}
            onPress={() => choose(activePlan.id)}
          />
        </View>
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
      {showRestore && onRestore ? (
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
      ) : null}
      {/* Only the restore's own wait. A background balance check used to
          show a spinner here too, coming and going under the run on every
          visit; the skeleton above is the one loading state now. */}
      {showRestore && onRestore && busy === "restore" ? (
        <View className="items-center">
          <Spinner size="sm" label="Looking for your subscription" />
        </View>
      ) : null}

      {/*
       * Every plan picker sells a subscription, including the upgrade sheet
       * whose button lives in its footer, so App Review wants the terms here.
       */}
      <SubscriptionLegalLinks />

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
          readingVoices={voicesByPlan?.[infoPlanId] ?? null}
        />
      ) : null}
    </View>
  );
}
