import type { CloudIdentity } from '@/hooks/use-cloud-identity';
import type { SubscriptionStatus } from '@/stores/subscription';

export type CloudBlocker =
  | 'offlineMode'
  /** The server has never answered, so nothing can be said about the plan. */
  | 'cloudUnreachable'
  | 'notConfigured'
  /** This build cannot sell anything, so the only door left is signing in. */
  | 'needsAccount'
  | 'needsPlan'
  | 'checkingPlan'
  /** Named for the account because that is usually what is being read. Now
   *  also covers the Keychain read that says whether this device is a guest. */
  | 'checkingAccount';

interface CloudAccessState {
  configured: boolean;
  identity: CloudIdentity['kind'];
  /** Whether this build has a store behind it. See below. */
  purchasable: boolean;
  subscriptionStatus: SubscriptionStatus;
  mode: 'cloud' | 'offline';
}

/** Returns the first prerequisite standing between the reader and Cloud. */
export function getCloudBlocker({
  configured,
  identity,
  purchasable,
  subscriptionStatus,
  mode,
}: CloudAccessState): CloudBlocker | null {
  if (!configured) return 'notConfigured';
  if (identity === 'unknown') return 'checkingAccount';
  /*
   * Nobody at all: no account, and no plan bought on this device.
   *
   * This used to be `needsAccount` without qualification, because paying
   * required registering. It does not any more, so the honest thing to ask
   * for is the plan, and the account becomes the answer only where there is
   * no other one - a build with no RevenueCat key, which can draw the plans
   * but cannot sell them.
   */
  if (identity === 'none') return purchasable ? 'needsPlan' : 'needsAccount';
  // Before the `unknown` beat, because this IS the beat having ended badly.
  // Left behind it, a failed first read would go on reading as "still
  // checking" and the surfaces that hide during a check would never return.
  if (subscriptionStatus === 'unreachable') return 'cloudUnreachable';
  if (subscriptionStatus === 'unknown') return 'checkingPlan';
  if (subscriptionStatus === 'none') return 'needsPlan';
  if (mode === 'offline') return 'offlineMode';
  return null;
}
