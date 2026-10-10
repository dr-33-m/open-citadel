import React from 'react';
import type { PurchasesPackage } from 'react-native-purchases';

import { showToast } from '@/components/toast/toast-provider';
import { usePlanCheckout } from '@/features/billing/hooks/use-plan-checkout';
import { usePlanOffer } from '@/features/billing/hooks/use-plan-offer';
import { useSubscriptionStore } from '@/stores/subscription';
import { CREDIT_PLANS, type PlanId } from 'samwell-shared';

/**
 * Selling a plan, wherever it is sold.
 *
 * Settings sold plans first and held all of this itself. Then a missing plan
 * became a wall in other places (Compass, a cloud reading voice), and the
 * shortest way through a wall is to sell the plan right there, not to send
 * somebody to Settings and hope they come back. So the selling is here, once:
 * what is on offer, the purchase and the restore with their toasts, and the
 * checkout that mints a guest identity first when nobody is signed in.
 *
 * `onActivated` runs when a plan is active at the end of it: bought just now,
 * restored, or found to be there already. A purchase that is only scheduled
 * or still pending does not run it, because nothing can be used yet.
 */
export function usePlanSale({
  enabled,
  onActivated,
}: {
  /** The identity has settled, so the purchases SDK is configured. See `usePlanOffer`. */
  enabled: boolean;
  onActivated?: () => void;
}) {
  const buy = useSubscriptionStore((s) => s.purchase);
  const restore = useSubscriptionStore((s) => s.restore);
  const busy = useSubscriptionStore((s) => s.busy);
  const offer = usePlanOffer(enabled);

  /**
   * Report what the store did, and nothing else. Closing whatever is on
   * screen is the caller's own call, through `onActivated`.
   */
  const onChoose = React.useCallback(
    async (plan: PlanId, packageToBuy: PurchasesPackage) => {
      const outcome = await buy(packageToBuy, plan);
      if (outcome) {
        showToast({
          message:
            outcome === 'scheduled'
              ? `${CREDIT_PLANS[plan].label} will begin at your next renewal.`
              : outcome === 'pending'
                ? 'Payment went through. Your plan will appear shortly.'
                : `${CREDIT_PLANS[plan].label} is yours.`,
          tone: 'success',
          key: 'billing',
        });
        if (outcome === 'active') onActivated?.();
        return outcome;
      }

      const purchaseError = useSubscriptionStore.getState().error;
      if (purchaseError) {
        showToast({ message: purchaseError, key: 'billing' });
      }
      return false;
    },
    [buy, onActivated],
  );

  const onRestore = React.useCallback(async () => {
    const restored = await restore();
    if (restored) {
      showToast({
        message: 'Subscription restored.',
        tone: 'success',
        key: 'billing',
      });
      onActivated?.();
      return;
    }

    const restoreError = useSubscriptionStore.getState().error;
    if (restoreError) {
      showToast({ message: restoreError, key: 'billing' });
    }
  }, [onActivated, restore]);

  /*
   * Everything that sells or recovers a plan goes through here rather than
   * straight to the store, because the carousel draws for somebody who has no
   * account yet. Signed in it is a passthrough. See `usePlanCheckout` for the
   * order, which is the part that costs money to get wrong.
   */
  const checkout = usePlanCheckout({
    buy: onChoose,
    restore: onRestore,
    onAlreadyActive: onActivated,
  });
  const { start } = checkout;
  const startPurchase = React.useCallback(
    (plan: PlanId, packageToBuy: PurchasesPackage) => start({ kind: 'buy', plan, packageToBuy }),
    [start],
  );
  const startRestore = React.useCallback(() => start({ kind: 'restore' }), [start]);

  return {
    offer,
    /** The purchase and the restore themselves, for a caller that is already signed in. */
    onChoose,
    onRestore,
    /** A purchase is under way, from the tap to the store's answer. */
    checkingOut: checkout.preparing !== null,
    /** What the plan carousel takes, whoever hosts it. */
    picker: {
      packages: offer.packages,
      catalogue: offer.catalogue,
      modelCounts: offer.modelCounts,
      voicesByPlan: offer.voicesByPlan,
      busy: checkout.preparing ?? busy,
      ready: offer.ready,
      failed: offer.failed,
      onRetry: offer.retry,
      onChoose: startPurchase,
      onRestore: startRestore,
    },
  };
}
