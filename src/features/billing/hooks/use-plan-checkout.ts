import React from 'react';
import type { PurchasesPackage } from 'react-native-purchases';
import type { PlanId } from 'samwell-shared';

import { showToast } from '@/components/toast/toast-provider';
import { identify, reclaimStorePurchases } from '@/services/purchases';
import { useAccountStore } from '@/stores/account';
import { useGuestStore } from '@/stores/guest';
import { useSubscriptionStore } from '@/stores/subscription';

/** What the reader asked for, before anyone worked out who they are. */
export type CheckoutIntent =
  | { kind: 'buy'; plan: PlanId; packageToBuy: PurchasesPackage }
  | { kind: 'restore' };

/**
 * Choosing a plan, with or without an account.
 *
 * ## Why there is no sign-in here any more
 *
 * App Review rejected the build under guideline 5.1.1(v): a subscription may
 * not require registration unless the purchase is tied to account-specific
 * functionality. This used to hold the intent, ask for an account, and then
 * carry it out. It does not ask any more. A device that has never signed in
 * mints a guest identity at this moment - an id and a secret, both random,
 * both kept in the Keychain - and buys against that. Registering is still
 * offered afterwards, and buys exactly one thing: the same plan on a second
 * device.
 *
 * ## The order is not a preference
 *
 * Tell the store who this is, THEN buy. RevenueCat's `app_user_id` is the
 * same value the server's credit ledger is keyed on, so a purchase made
 * before the join lands is recorded against the anonymous customer the SDK
 * was configured with. The store would take the money, the webhook would
 * carry an id nobody can ever authenticate as, and the credits would be
 * granted to a ghost. Aliasing afterwards moves entitlements, not ledger
 * rows.
 *
 * Which is why `identify` is awaited. The account store fires it on sign-in
 * and deliberately does not wait, because a session is real whether or not a
 * purchases SDK could be reached; a purchase seconds later cannot take that
 * view. See `services/purchases`.
 */

/**
 * Who this purchase belongs to, minting a guest identity if there is nobody.
 *
 * The account wins when there is one, the same order `cloudHeaders` uses. The
 * guest is minted here rather than at launch on purpose: an install that
 * never buys anything should not be registering itself with a server, and a
 * guest receives no free credits, so there is nothing to farm by reinstalling.
 */
async function checkoutSubject(): Promise<string | null> {
  const account = useAccountStore.getState();
  if (account.status === 'signedIn' && account.sub) return account.sub;
  return useGuestStore.getState().adopt();
}

/**
 * Ask Play what this guest already owns, without letting the answer block a
 * sale. A failure here is no worse than not asking: the store still refuses
 * the same product twice, and the purchase turns that into a restore.
 */
async function reclaimQuietly(subject: string): Promise<boolean> {
  try {
    return await reclaimStorePurchases(subject);
  } catch (error) {
    if (__DEV__) console.warn('[Checkout] Could not check Play for an earlier plan:', error);
    return false;
  }
}

/**
 * Everything between the tap and the store sheet. Lifted out of the hook so
 * the order can be tested without a renderer, since the order is the part
 * that costs money to get wrong.
 *
 * `carryOut` is the original intent: the store's purchase, or its restore.
 */
export async function completeCheckout(
  intent: CheckoutIntent,
  carryOut: (intent: CheckoutIntent) => Promise<void>,
  onAlreadyActive?: () => void,
): Promise<void> {
  let subject: string | null;
  try {
    subject = await checkoutSubject();
  } catch (error) {
    if (__DEV__) console.warn('[Checkout] Could not mint a device identity:', error);
    subject = null;
  }
  // No id to buy against is not a state to guess at. Nothing was charged and
  // nothing was lost; the button is theirs to press again.
  if (!subject) {
    showToast({
      message: 'Could not start the purchase. Try again in a moment.',
      key: 'billing',
    });
    return;
  }

  try {
    await identify(subject);
  } catch (error) {
    if (__DEV__) console.warn('[Checkout] Could not identify with RevenueCat:', error);
    showToast({
      message: 'Could not reach the store. Check your connection and try again.',
      key: 'billing',
    });
    return;
  }

  /*
   * Ask the server before selling. A plan can already be here without this
   * screen knowing: RevenueCat moves a purchase made on this device onto the
   * id it has just been told about, and the server reconciles an id it has
   * never seen straight from RevenueCat on the first read. Selling somebody a
   * second subscription they already hold is the one outcome here that costs
   * real money.
   *
   * Only on the way to a purchase. A restore does its own read, and this one
   * would turn "restored" into "already active" for every reader who took the
   * restore door.
   */
  if (intent.kind === 'buy') {
    /*
     * Side by side, so a reader who never paid waits for one round trip, not
     * two. Only when Play did hand something back does the server get asked
     * again, since the first read may have landed before the transfer.
     */
    const [reclaimed] = await Promise.all([
      reclaimQuietly(subject),
      useSubscriptionStore.getState().refresh(),
    ]);
    if (reclaimed) await useSubscriptionStore.getState().refresh();
    if (useSubscriptionStore.getState().status === 'active') {
      showToast({
        message: 'You already have an active plan.',
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
  /** A plan was already here, so there is nothing left to buy. */
  onAlreadyActive?: () => void;
}) {
  /**
   * The step between the tap and the store sheet opening.
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

  /**
   * The real guard on a second tap.
   *
   * `preparing` is what the button reads, but state lands a render later, and
   * a tap in that gap would start a second purchase. A ref is the same fact
   * without the delay.
   */
  const inFlight = React.useRef(false);

  const start = React.useCallback(
    (intent: CheckoutIntent) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPreparing(intent.kind === 'restore' ? 'restore' : intent.plan);
      void (async () => {
        try {
          await completeCheckout(intent, run, onAlreadyActive);
        } finally {
          inFlight.current = false;
          setPreparing(null);
        }
      })();
    },
    [run, onAlreadyActive],
  );

  return { preparing, start };
}
