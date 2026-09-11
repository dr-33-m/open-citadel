import React from 'react';
import { AppState } from 'react-native';

import { PURCHASES_ENABLED } from '@/constants/revenuecat';
import {
    readCustomerInfo,
    subscribeToCustomerInfo,
} from '@/services/purchases';
import { useAccountStore } from '@/stores/account';
import { useSubscriptionStore } from '@/stores/subscription';

/** Keep renewal metadata current across SDK updates and store handoffs. */
export function useBillingLifecycle(accountId: string | null): void {
  React.useEffect(() => {
    const store = useSubscriptionStore.getState();
    if (!accountId || !PURCHASES_ENABLED) {
      store.applyCustomerInfo(null);
      return;
    }

    let mounted = true;
    let readInFlight: Promise<void> | null = null;
    const apply = (customerInfo: Awaited<ReturnType<typeof readCustomerInfo>>) => {
      if (mounted && useAccountStore.getState().sub === accountId) {
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
      read(true);
      void useSubscriptionStore.getState().refresh();
    });

    return () => {
      mounted = false;
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [accountId]);
}