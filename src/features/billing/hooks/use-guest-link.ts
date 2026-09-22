import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { linkGuestToAccount } from '@/services/guest-link';
import { identify, restore as restorePurchases } from '@/services/purchases';
import { useAccountStore } from '@/stores/account';
import { useGuestStore } from '@/stores/guest';
import { useSubscriptionStore } from '@/stores/subscription';

/**
 * Joins a plan bought on this phone to the account that has just appeared.
 *
 * Mounted once at the root, and keyed on the pair rather than fired from the
 * sign-in. Three moments want this and only one of them is a sign-in: the
 * reader registering after buying, a launch where last time's attempt never
 * got an answer, and a reader who signs in on a phone that bought something
 * long ago. One effect covers all three, and the alternative was three call
 * sites deciding the same thing, which is how this codebase has drifted
 * before.
 *
 * Until it runs, the two identities are both real and the app shows the
 * account's answer, which for a new account is no plan at all. That is
 * exactly what somebody sees if they buy as a guest and then sign in, so this
 * is not a tidy-up. It is the thing that gives them back what they paid for.
 */
export function useGuestLink(): void {
  const accountId = useAccountStore((s) => (s.status === 'signedIn' ? s.sub : null));
  const guestId = useGuestStore((s) => (s.status === 'guest' ? s.guestId : null));

  React.useEffect(() => {
    if (!accountId || !guestId) return;

    /**
     * Whether this pair is still the one on screen.
     *
     * Read ONCE, before anything has been committed to, and never again.
     * Letting go of the identity re-renders the root and tears this effect
     * down, so a second check after that point is a check against our own
     * success: the refresh and the toast would be skipped for exactly the
     * readers the link worked for.
     */
    let current = true;
    void (async () => {
      let outcome;
      try {
        outcome = await linkGuestToAccount();
      } catch (error) {
        /*
         * Quiet, and deliberately so. Nothing has been lost: the server holds
         * the plan under the guest id either way, the device still has its
         * credential, and the next launch tries again. Saying "we could not
         * move your plan" to somebody who has not noticed there was anything
         * to move would invent a problem.
         */
        if (__DEV__) console.warn('[Guest] Could not link this device yet:', error);
        return;
      }
      if (!current || outcome === 'nothing') return;

      if (outcome === 'accountHasPlan') {
        showToast({
          message:
            'This account already has its own plan, so the one on this device was left where it is. Nothing has been taken from either.',
          key: 'billing',
        });
        return;
      }

      /*
       * The last attempt worked and its answer never arrived. There is
       * nothing to move and nothing to announce - they were told the first
       * time - so this only retires a credential for a plan that has already
       * moved on, which is what stops the retry happening forever.
       */
      if (outcome === 'alreadyLinked') {
        await useGuestStore.getState().retire();
        return;
      }

      /*
       * The server has already moved the plan and is the authority on it, so
       * everything below is tidying and none of it is allowed to fail loudly.
       *
       * Telling RevenueCat second, not first. Its own view converging means
       * later renewals arrive carrying the account directly rather than being
       * redirected through the link table, which is nicer but changes no
       * outcome. Doing it BEFORE the server link would be the dangerous
       * order: the entitlement would move to the account while the ledger row
       * was still under the guest id, and the next reconcile would find a
       * paying reader with nothing.
       */
      try {
        await identify(accountId);
        await restorePurchases();
      } catch (error) {
        if (__DEV__) console.warn('[Guest] Linked, but the store did not follow:', error);
      }

      // Before retiring the identity, so the reader hears about it from a
      // component that is still mounted. `refresh` asks as the account, which
      // is where the plan now is.
      await useSubscriptionStore.getState().refresh();
      /*
       * Only when a plan actually arrived. A guest is minted at the moment of
       * purchase, so one whose purchase was cancelled - or one the server has
       * forgotten - links with nothing to move, and telling that reader
       * their plan has moved would be telling them they have one.
       */
      if (useSubscriptionStore.getState().status === 'active') {
        showToast({
          message: 'Your plan is on your account now. Sign in anywhere to use it.',
          tone: 'success',
          key: 'billing',
        });
      }

      // Last. The guest token is refused from here on anyway, and retiring
      // the credential earlier would leave nothing to retry with. Retired,
      // not forgotten: this device never becomes a second guest.
      await useGuestStore.getState().retire();
    })();

    return () => {
      current = false;
    };
  }, [accountId, guestId]);
}
