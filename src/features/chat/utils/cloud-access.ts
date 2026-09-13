import type { AccountStatus } from '@/stores/account';
import type { SubscriptionStatus } from '@/stores/subscription';

export type CloudBlocker =
  | 'offlineMode'
  | 'notConfigured'
  | 'needsAccount'
  | 'needsPlan'
  | 'checkingPlan'
  | 'checkingAccount';

interface CloudAccessState {
  configured: boolean;
  accountStatus: AccountStatus;
  subscriptionStatus: SubscriptionStatus;
  mode: 'cloud' | 'offline';
}

/** Returns the first prerequisite standing between the reader and Cloud. */
export function getCloudBlocker({
  configured,
  accountStatus,
  subscriptionStatus,
  mode,
}: CloudAccessState): CloudBlocker | null {
  if (!configured) return 'notConfigured';
  if (accountStatus === 'unknown') return 'checkingAccount';
  if (accountStatus === 'signedOut') return 'needsAccount';
  if (subscriptionStatus === 'unknown') return 'checkingPlan';
  if (subscriptionStatus === 'none') return 'needsPlan';
  if (mode === 'offline') return 'offlineMode';
  return null;
}
