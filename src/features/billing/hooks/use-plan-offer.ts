import { useQuery } from '@tanstack/react-query';
import React from 'react';
import type { PurchasesPackage } from 'react-native-purchases';
import { planForPackage, type PlanId, type VoiceFigures } from 'samwell-shared';

import { PURCHASES_ENABLED } from '@/constants/revenuecat';
import {
  createOfferingQueryOptions,
  createPlanPreviewQueryOptions,
  prefetchPlanOffer,
} from '@/query-manager/billing';
import type { PlanModel } from '@/stores/subscription';

const NO_COUNTS: Record<PlanId, number> = { maester: 0, grand_maester: 0, archmaester: 0 };

/**
 * How long the prices wait for the counts once they are in hand. Long enough
 * for a server that answers at all, so the cards land whole; short enough
 * that a hung one cannot hold every price behind the skeleton through its
 * retries.
 */
const COUNTS_GRACE_MS = 1_500;

export type PlanOffer = {
  /** The store package behind each plan, keyed exactly. See `planForPackage`. */
  packages: Partial<Record<PlanId, PurchasesPackage>>;
  /** How many models each plan opens up, or zeros if the server never said. */
  modelCounts: Record<PlanId, number>;
  /** Every model with its tier, for the plan info sheets. */
  catalogue: PlanModel[];
  /** The reading voices each plan reaches and the hours its default gives, or null from an older server. */
  voicesByPlan: VoiceFigures['byPlan'] | null;
  /**
   * Everything the cards say is in hand, so they can be drawn whole.
   *
   * The cards used to draw at once and fill in as answers arrived: a price
   * shimmering, then the price, then a "brains" line pushing the card taller
   * when the server caught up. Three arrivals is a card that glitches. Held
   * until both are in, the carousel goes from its skeleton to the finished
   * cards in one dissolve.
   */
  ready: boolean;
  /** The store could not be reached for prices, even after retrying. */
  failed: boolean;
  retry: () => void;
};

/**
 * The plans on sale and what each one holds, for the plan carousel.
 *
 * Both answers come from TanStack Query and are usually already cached: the
 * account store prefetches them the moment the purchases SDK is configured,
 * and Settings asks again when it opens (`useWarmPlanOffer`), so on most
 * opens this returns `ready` on its first render. The carousel still draws
 * its skeleton for a frame before the cards (see `PlanCarousel`), but it is
 * never left waiting on the store.
 *
 * `enabled` waits for the identity to settle, because the account store is
 * what configures the purchases SDK and asking before it throws.
 */
export function usePlanOffer(enabled: boolean): PlanOffer {
  const offering = useQuery(createOfferingQueryOptions({ enabled: enabled && PURCHASES_ENABLED }));
  const preview = useQuery(createPlanPreviewQueryOptions({ enabled }));

  const packages = React.useMemo(() => {
    const out: Partial<Record<PlanId, PurchasesPackage>> = {};
    for (const pkg of offering.data?.availablePackages ?? []) {
      const plan = planForPackage(pkg.identifier);
      if (plan) out[plan] = pkg;
    }
    return out;
  }, [offering.data]);

  const pricesIn = offering.isSuccess;
  const [graceOver, setGraceOver] = React.useState(false);
  React.useEffect(() => {
    if (!pricesIn || !preview.isPending) return undefined;
    const timer = setTimeout(() => setGraceOver(true), COUNTS_GRACE_MS);
    return () => clearTimeout(timer);
  }, [pricesIn, preview.isPending]);

  const { refetch: refetchOffering } = offering;
  const { refetch: refetchPreview } = preview;
  const retry = React.useCallback(() => {
    void refetchOffering();
    void refetchPreview();
  }, [refetchOffering, refetchPreview]);

  return {
    packages,
    modelCounts: preview.data?.modelsByPlan ?? NO_COUNTS,
    catalogue: preview.data?.catalogue ?? [],
    voicesByPlan: preview.data?.voices?.byPlan ?? null,
    // The counts are a nicety: a server that cannot say them does not hold
    // the prices back past a short grace. Settled either way is enough.
    ready: pricesIn && (!preview.isPending || graceOver),
    // Not while asking again, so TRY AGAIN visibly does something: the
    // skeleton comes back until the answer does.
    failed: offering.isError && !offering.isFetching,
    retry,
  };
}

/**
 * Ask for the plans before anybody asks to see them.
 *
 * For the screen the plan carousel lives on, called while the carousel is
 * still a tap away. Launch already asks once, but that one attempt can miss:
 * no network yet, or Play Billing answering empty in its first moments. Asked
 * again here, the prices are in hand by the time Cloud is chosen. It costs
 * nothing when they already are: a prefetch of something still fresh does not
 * go to the store, and one already in flight is joined rather than repeated.
 *
 * Nothing subscribes, so the answer landing redraws nothing.
 */
export function useWarmPlanOffer(enabled: boolean): void {
  React.useEffect(() => {
    if (enabled) prefetchPlanOffer();
  }, [enabled]);
}
