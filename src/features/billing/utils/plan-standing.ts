/**
 * How a plan stands, for the sheet that manages it: the badge, the line
 * under the plan's name, and what the store row is called.
 *
 * Two kinds of plan reach that sheet. A subscription has a store behind it,
 * which can be renewing, cancelled or failing to charge. An insider plan has
 * none: it was given, it ends on a date, and there is nothing to cancel. The
 * sheet draws whichever this says.
 */
import { CREDIT_PLANS, type PlanId } from 'samwell-shared';

import { insiderPlanDetail, type InsiderStanding } from '@/features/billing/utils/insider';
import { formatSubscriptionDate } from '@/features/billing/utils/subscription-lifecycle';
import type { SubscriptionLifecycle } from '@/services/purchase-lifecycle';

export interface PlanStanding {
  /** Given by a code, so nothing here belongs to a store. */
  insider: boolean;
  /** What the sheet is called, and the line under it. */
  title: string;
  subtitle: string;
  badge: string;
  tone: 'warning' | 'secondary';
  /** The line under the plan's name. */
  detail: string;
  /** The row that hands billing to the store. Not drawn for an insider. */
  manageLabel: string;
  manageDetail: string;
}

export function planStanding({
  plan,
  lifecycle,
  balance,
  testStore,
}: {
  plan: PlanId;
  lifecycle: SubscriptionLifecycle | null;
  balance: InsiderStanding;
  testStore: boolean;
}): PlanStanding {
  if (balance.source === 'insider') {
    return {
      insider: true,
      title: 'Insider Plan',
      subtitle: 'Given to you by Open Citadel. Nothing is charged.',
      badge: 'Insider',
      tone: 'secondary',
      detail: insiderPlanDetail(plan, balance),
      manageLabel: '',
      manageDetail: '',
    };
  }

  // The store's word only counts when it is about the plan being drawn.
  const current = lifecycle?.plan === plan ? lifecycle : null;
  const periodEnd = formatSubscriptionDate(current?.expiresAt ?? null);
  const billingIssue = Boolean(current?.billingIssueDetectedAt);
  const canceled = Boolean(current?.unsubscribeDetectedAt);
  const nonRenewing = current !== null && !current.willRenew;

  const badge = billingIssue
    ? 'Payment issue'
    : canceled
      ? 'Canceled'
      : nonRenewing
        ? 'Not renewing'
        : 'Active';
  const detail = billingIssue
    ? periodEnd
      ? `Access remains active through ${periodEnd} while the store retries payment.`
      : 'Access remains active while the store retries payment.'
    : nonRenewing
      ? periodEnd
        ? `Access remains active through ${periodEnd}.`
        : 'Access remains active through the end of this billing period.'
      : `${CREDIT_PLANS[plan].monthlyCredits.toLocaleString()} neurons each month`;

  return {
    insider: false,
    title: 'Manage Subscription',
    subtitle: 'Change the plan or hand billing back to the store.',
    badge,
    tone: billingIssue ? 'warning' : 'secondary',
    detail,
    manageLabel: billingIssue ? 'Fix payment' : 'Manage or cancel',
    manageDetail: testStore
      ? 'Open Test Store guidance'
      : billingIssue
        ? 'Update your payment method in the store'
        : "Continue in your device's subscription settings",
  };
}
