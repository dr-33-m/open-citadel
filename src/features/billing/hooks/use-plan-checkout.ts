import React from 'react';
import type { PurchasesPackage } from 'react-native-purchases';
import type { PlanId } from 'samwell-shared';

import { showToast } from '@/components/toast/toast-provider';
import { identify } from '@/services/purchases';
import { useAccountStore } from '@/stores/account';
import { useSubscriptionStore } from '@/stores/subscription';

/** What the reader asked for before anyone knew whether they had an account. */
export type CheckoutIntent =
  | { kind: 'buy'; plan: PlanId; packageToBuy: PurchasesPackage }
  | { kind: 'restore' };

/**
 * Choosing a plan, whether or not there is an account yet.
 *
 * Signed in, this is a straight passthrough to the store's own purchase. The
 * work is the other case: the carousel now draws for a reader who has never
 * signed in, so `start` has to hold what they asked for, ask for an account,
 * and then carry out the original request without making them find the plan
 * again.
 *
 * ## The order is not a preference
 *
 * Sign in first, then buy. RevenueCat's `app_user_id` IS the Logto subject,
 * and the server's credit ledger is keyed on that same value with a prefix -
 * so a purchase made before the join lands is recorded against the anonymous
 * customer the app was configured with while signed out. The store would take
 * the money, the webhook would carry an id nobody can ever authenticate as,
 * and the credits would be granted to a ghost. Aliasing afterwards moves
 * entitlements, not ledger rows.
 *
 * Which is why `identify` is awaited here. The account store fires it on
 * sign-in and deliberately does not wait, because a session is real whether
 * or not a purchases SDK could be reached; a purchase seconds later cannot
 * take that view. See `services/purchases`.
 */
/**
 * Everything between a sign-in landing and the thing they asked for
 * happening. Lifted out of the hook so the order can be tested without a
 * renderer, since the order is the part that costs money to get wrong.
 *
 * `carryOut` is the original intent: the store's purchase, or its restore.
 */
export async function completeCheckout(
  intent: CheckoutIntent,
  carryOut: (intent: CheckoutIntent) => Promise<void>,
  onAlreadyActive?: () => void,
): Promise<void> {
  const sub = useAccountStore.getState().sub;
  // Signed in without a subject is not a state to guess at. Nothing was
  // charged and nothing was lost; the button is theirs to press again.
  if (!sub) return;

  try {
    await identify(sub);
  } catch (error) {
    if (__DEV__) console.warn('[Checkout] Could not identify with RevenueCat:', error);
    showToast({
      message: 'Could not reach the store. Check your connection and try again.',
      key: 'billing',
    });
    return;
  }

  /*
   * Signing in can be how a plan arrives. RevenueCat moves a purchase made
   * on this device onto the account it has just been told about, and the
   * server reconciles an account it has never seen straight from RevenueCat
   * on the first read. Selling somebody a second subscription they already
   * hold is the one outcome here that costs real money.
   *
   * Only on the way to a purchase. A restore does its own read, and this one
   * would turn "restored" into "already active" for every reader who took
   * the restore door.
   */
  if (intent.kind === 'buy') {
    await useSubscriptionStore.getState().refresh();
    if (useSubscriptionStore.getState().status === 'active') {
      showToast({
        message: 'Your plan is already active on this account.',
        tone: 'success',
        key: 'billing',
      });
      onAlreadyActive?.();
      return;
    }
  }

  await carryOut(intent);
}

export function usePlanCheckout({
  buy,
  restore,
  onAlreadyActive,
}: {
  buy: (plan: PlanId, packageToBuy: PurchasesPackage) => Promise<unknown>;
  restore: () => Promise<void>;
  /** A plan arrived with the sign-in, so there is nothing left to buy. */
  onAlreadyActive?: () => void;
}) {
  /** The intent waiting on an account. Also whether the sheet is up. */
  const [pending, setPending] = React.useState<CheckoutIntent | null>(null);
  /**
   * The step between the sign-in landing and the store sheet opening.
   *
   * Shaped like the subscription store's own `busy` so the carousel can take
   * either: the button keeps spinning from the tap through to the purchase,
   * rather than going quiet in the gap and inviting a second tap.
   */
  const [preparing, setPreparing] = React.useState<PlanId | 'restore' | null>(null);

  const run = React.useCallback(
    async (intent: CheckoutIntent) => {
      if (intent.kind === 'restore') {
        await restore();
        return;
      }
      await buy(intent.plan, intent.packageToBuy);
    },
    [buy, restore],
  );

  const start = React.useCallback(
    (intent: CheckoutIntent) => {
      if (useAccountStore.getState().status === 'signedIn') {
        void run(intent);
        return;
      }
      setPending(intent);
    },
    [run],
  );

  const dismiss = React.useCallback(() => setPending(null), []);

  const onSignedIn = React.useCallback(async () => {
    const intent = pending;
    setPending(null);
    if (!intent) return;

    setPreparing(intent.kind === 'restore' ? 'restore' : intent.plan);
    try {
      await completeCheckout(intent, run, onAlreadyActive);
    } finally {
      setPreparing(null);
    }
  }, [pending, run, onAlreadyActive]);

  return { pending, preparing, start, dismiss, onSignedIn };
}
