import type { CustomerInfo, PurchasesEntitlementInfo } from 'react-native-purchases';
import { describe, expect, it } from 'vitest';

import {
    googleProductToReplace,
    subscriptionLifecycle,
} from '../purchase-lifecycle';

function customerInfo(
  activeSubscriptions: string[],
  entitlementProduct?: string,
): CustomerInfo {
  return {
    activeSubscriptions,
    entitlements: {
      active: entitlementProduct
        ? {
            maester: {
              productIdentifier: entitlementProduct,
            } as PurchasesEntitlementInfo,
          }
        : {},
    },
  } as CustomerInfo;
}

describe('googleProductToReplace', () => {
  it('returns the active product backing the current entitlement', () => {
    expect(
      googleProductToReplace(
        customerInfo(['samwell.maester.monthly'], 'samwell.maester.monthly'),
        'maester',
      ),
    ).toBe('samwell.maester.monthly');
  });

  it('strips the Android base-plan suffix', () => {
    expect(
      googleProductToReplace(
        customerInfo(
          ['samwell.maester.monthly:monthly'],
          'samwell.maester.monthly',
        ),
        'maester',
      ),
    ).toBe('samwell.maester.monthly');
  });

  it('refuses to add another plan when multiple Play subscriptions are active', () => {
    expect(() =>
      googleProductToReplace(
        customerInfo(
          ['samwell.archmaester.monthly', 'samwell.maester.monthly:monthly'],
          'samwell.maester.monthly',
        ),
        'maester',
      ),
    ).toThrow('More than one Play subscription is active');
  });

  it('refuses to open a parallel subscription when no active product matches', () => {
    expect(() =>
      googleProductToReplace(
        customerInfo(['samwell.archmaester.monthly'], 'samwell.maester.monthly'),
        'maester',
      ),
    ).toThrow('Manage it in Google Play');
  });

  it('refuses a change when the current entitlement is no longer active', () => {
    expect(() =>
      googleProductToReplace(customerInfo(['samwell.maester.monthly']), 'maester'),
    ).toThrow('Refresh or restore purchases');
  });
});

describe('subscriptionLifecycle', () => {
  it('keeps canceled subscriptions active through their expiration', () => {
    const expiresAt = '2026-04-01T00:00:00Z';
    const info = customerInfo(['samwell.maester.monthly'], 'samwell.maester.monthly');
    info.entitlements.active.maester = {
      ...info.entitlements.active.maester,
      willRenew: false,
      expirationDate: expiresAt,
      unsubscribeDetectedAt: '2026-03-10T00:00:00Z',
      billingIssueDetectedAt: null,
    } as PurchasesEntitlementInfo;

    expect(subscriptionLifecycle(info)).toEqual({
      plan: 'maester',
      willRenew: false,
      expiresAt,
      unsubscribeDetectedAt: '2026-03-10T00:00:00Z',
      billingIssueDetectedAt: null,
    });
  });

  it('uses the highest entitlement during plan overlap', () => {
    const info = customerInfo(['maester', 'archmaester'], 'maester');
    info.entitlements.active.archmaester = {
      willRenew: true,
      expirationDate: '2026-04-02T00:00:00Z',
      unsubscribeDetectedAt: null,
      billingIssueDetectedAt: null,
    } as PurchasesEntitlementInfo;

    expect(subscriptionLifecycle(info)?.plan).toBe('archmaester');
  });
});