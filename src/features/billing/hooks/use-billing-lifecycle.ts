import React from 'react';
import { AppState } from 'react-native';

import { PURCHASES_ENABLED } from '@/constants/revenuecat';
import {
    readCustomerInfo,
    subscribeToCustomerInfo,
} from '@/services/purchases';
import { readCloudIdentity } from '@/hooks/use-cloud-identity';
import { useSubscriptionStore } from '@/stores/subscription';

/**
 * Keep renewal metadata current across SDK updates and store handoffs.
 *
 * Takes whoever the server meters against, account or guest. A device that
 * bought a plan without an account has the same renewal date to draw, and
 * keying this on the account alone left it with none.
 */
export function useBillingLifecycle(identityId: string | null): void {
  React.useEffect(() => {
    const store = useSubscriptionStore.getState();
    if (!identityId || !PURCHASES_ENABLED) {
      store.applyCustomerInfo(null);
      return;
    }

    let mounted = true;
    let readInFlight: Promise<void> | null = null;
    const apply = (customerInfo: Awaited<ReturnType<typeof readCustomerInfo>>) => {
      // Still the same reader. A sign-in mid-read moves the ledger key, and
      // applying the phone's CustomerInfo to the person would be the wrong
      // renewal date on the right card.
      if (mounted && readCloudIdentity().id === identityId) {
        useSubscriptionStore.getState().applyCustomerInfo(customerInfo);
      }
    };
    const read = (fresh: boolean) => {
      if (readInFlight) return;
      readInFlight = readCustomerInfo(fresh)
        .then(apply)
        .catch((error) => {
          if (__DEV__) console.warn('[Billing] Could not refresh CustomerInfo:', error);
        })
        .finally(() => {
          readInFlight = null;
        });
    };

    const unsubscribe = subscribeToCustomerInfo(apply);
    read(true);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      // The server's plan is rechecked by `usePlanSync` at the root, in every
      // mode; this only keeps the store's own renewal details current.
      read(true);
    });

    return () => {
      mounted = false;
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [identityId]);
}