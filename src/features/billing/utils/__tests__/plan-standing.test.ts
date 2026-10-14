import { describe, expect, it } from 'vitest';

import { planStanding } from '../plan-standing';
import { formatSubscriptionDate, formatTermDate } from '../subscription-lifecycle';

const PERIOD_END = '2026-11-12T12:00:00.000Z';
const YEAR_END = '2027-10-13T12:00:00.000Z';
const paid = { source: 'subscription', periodEndsAt: PERIOD_END, termEndsAt: null } as const;
const renewing = {
  plan: 'maester',
  willRenew: true,
  expiresAt: PERIOD_END,
  unsubscribeDetectedAt: null,
  billingIssueDetectedAt: null,
} as const;

function standing(lifecycle: Parameters<typeof planStanding>[0]['lifecycle'], testStore = false) {
  return planStanding({ plan: 'maester', lifecycle, balance: paid, testStore });
}

describe('planStanding', () => {
  it('draws an insider plan with its end and no store', () => {
    const insider = { source: 'insider', periodEndsAt: PERIOD_END, termEndsAt: YEAR_END } as const;
    // A store lifecycle left over from an old purchase says nothing about it.
    expect(
      planStanding({ plan: 'maester', lifecycle: renewing, balance: insider, testStore: false }),
    ).toMatchObject({
      insider: true,
      title: 'Insider Plan',
      subtitle: 'Given to you by Open Citadel. Nothing is charged.',
      badge: 'Insider',
      tone: 'secondary',
      detail: `${(2500).toLocaleString()} neurons each month, until ${formatTermDate(YEAR_END)}`,
    });
  });

  it('is active while the store is renewing it', () => {
    expect(standing(renewing)).toEqual({
      insider: false,
      title: 'Manage Subscription',
      subtitle: 'Change the plan or hand billing back to the store.',
      badge: 'Active',
      tone: 'secondary',
      detail: `${(2500).toLocaleString()} neurons each month`,
      manageLabel: 'Manage or cancel',
      manageDetail: "Continue in your device's subscription settings",
    });
  });

  it('is active when the store has not been heard from', () => {
    expect(standing(null).badge).toBe('Active');
    // Or has only been heard from about another plan.
    expect(standing({ ...renewing, plan: 'archmaester', willRenew: false }).badge).toBe('Active');
  });

  it('says a cancelled plan lasts until its period ends', () => {
    const canceled = standing({ ...renewing, willRenew: false, unsubscribeDetectedAt: PERIOD_END });
    expect(canceled.badge).toBe('Canceled');
    expect(canceled.detail).toBe(
      `Access remains active through ${formatSubscriptionDate(PERIOD_END)}.`,
    );
    expect(standing({ ...renewing, willRenew: false }).badge).toBe('Not renewing');
  });

  it('puts a payment issue first, and points the store row at fixing it', () => {
    const failing = standing({
      ...renewing,
      willRenew: false,
      unsubscribeDetectedAt: PERIOD_END,
      billingIssueDetectedAt: PERIOD_END,
    });
    expect(failing).toMatchObject({
      badge: 'Payment issue',
      tone: 'warning',
      manageLabel: 'Fix payment',
      manageDetail: 'Update your payment method in the store',
    });
  });

  it('says so when the store is the test one', () => {
    expect(standing(renewing, true).manageDetail).toBe('Open Test Store guidance');
  });
});
