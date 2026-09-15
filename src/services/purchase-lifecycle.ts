import type { CustomerInfo } from 'react-native-purchases';
import {
    CREDIT_PLANS,
    bestPlan,
    type PlanId,
} from 'samwell-shared';

export type SubscriptionLifecycle = {
  plan: PlanId;
  willRenew: boolean;
  expiresAt: string | null;
  unsubscribeDetectedAt: string | null;
  billingIssueDetectedAt: string | null;
};

/** The highest active store entitlement, including its renewal state. */
export function subscriptionLifecycle(
  customerInfo: CustomerInfo,
): SubscriptionLifecycle | null {
  const plan = bestPlan(Object.keys(customerInfo.entitlements.active));
  if (!plan) return null;

  const entitlement = customerInfo.entitlements.active[CREDIT_PLANS[plan].entitlement];
  if (!entitlement) return null;

  return {
    plan,
    willRenew: entitlement.willRenew,
    expiresAt: entitlement.expirationDate,
    unsubscribeDetectedAt: entitlement.unsubscribeDetectedAt,
    billingIssueDetectedAt: entitlement.billingIssueDetectedAt,
  };
}

/** Google may suffix a product with its base plan in CustomerInfo. */
function googleProductId(identifier: string): string {
  return identifier.split(':', 1)[0];
}

/**
 * Find the one active Play product that backs the plan being changed.
 *
 * Starting a new purchase without this value creates a parallel subscription,
 * so ambiguity is a hard stop rather than a reason to omit replacement info.
 */
export function googleProductToReplace(
  customerInfo: CustomerInfo,
  entitlementId: string,
): string {
  const entitlement = customerInfo.entitlements.active[entitlementId];
  if (!entitlement) {
    throw new Error(
      'Your current Play subscription could not be identified. Refresh or restore purchases, then try again.',
    );
  }

  const activeProducts = new Set(customerInfo.activeSubscriptions.map(googleProductId));
  if (activeProducts.size !== 1) {
    throw new Error(
      'More than one Play subscription is active. Manage them in Google Play before changing plans.',
    );
  }

  const entitlementProduct = googleProductId(entitlement.productIdentifier);
  const activeProduct = [...activeProducts][0];
  if (activeProduct !== entitlementProduct) {
    throw new Error(
      'Your current Play subscription could not be identified. Manage it in Google Play before changing plans.',
    );
  }

  return activeProduct;
}
