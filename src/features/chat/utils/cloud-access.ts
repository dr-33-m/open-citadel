import type { AccountStatus } from '@/stores/account';
import type { SubscriptionStatus } from '@/stores/subscription';

export type CloudBlocker =
  | 'offlineMode'
  /** The server has never answered, so nothing can be said about the plan. */
  | 'cloudUnreachable'
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
  // Before the `unknown` beat, because this IS the beat having ended badly.
  // Left behind it, a failed first read would go on reading as "still
  // checking" and the surfaces that hide during a check would never return.
  if (subscriptionStatus === 'unreachable') return 'cloudUnreachable';
  if (subscriptionStatus === 'unknown') return 'checkingPlan';
  if (subscriptionStatus === 'none') return 'needsPlan';
  if (mode === 'offline') return 'offlineMode';
  return null;
}
