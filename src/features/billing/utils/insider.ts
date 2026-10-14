/**
 * What an insider plan is said to be, wherever it is said.
 *
 * Three places name one: the sheet that has just redeemed a code, the credit
 * meter, and the plan's own management sheet. The wording and the figures
 * are worked out here, purely, so the three cannot describe the same plan
 * three ways.
 */
import {
  CREDIT_PLANS,
  INSIDER_TERMS,
  type CreditBalance,
  type InsiderRedemption,
  type PlanId,
} from 'samwell-shared';

import { formatTermDate } from '@/features/billing/utils/subscription-lifecycle';

/** One figure on a tile. The shape `StatGrid` draws. */
type Figure = { key: string; value: string; label: string };

export interface InsiderWelcome {
  /** "Maester Samwell is yours until 13 Oct 2027." */
  line: string;
  figures: Figure[];
}

/**
 * A redeemed code, as the sheet says it: the plan and its end in one line,
 * then the term and the Neurons as figures.
 *
 * Neurons arrive a month at a time, so a term longer than a month says "a
 * month" and a shorter one does not: a week's code is one grant, and calling
 * it monthly would promise a second that never comes.
 */
export function insiderWelcome(redemption: InsiderRedemption): InsiderWelcome {
  const plan = CREDIT_PLANS[redemption.plan];
  const ends = formatTermDate(redemption.endsAt);
  const term = redemption.duration ? INSIDER_TERMS[redemption.duration] : null;
  const monthly = term === null || term.days > INSIDER_TERMS.month.days;

  return {
    line: ends ? `${plan.label} is yours until ${ends}.` : `${plan.label} is yours.`,
    figures: [
      ...(term ? [{ key: 'term', value: term.label, label: 'YOUR TERM' }] : []),
      {
        key: 'neurons',
        value: plan.monthlyCredits.toLocaleString('en-US'),
        label: monthly ? 'NEURONS A MONTH' : 'NEURONS',
      },
    ],
  };
}

/** The part of a balance that says whether a plan is an insider one. */
export type InsiderStanding = Pick<CreditBalance, 'source' | 'periodEndsAt' | 'termEndsAt'>;

/**
 * When an insider plan ends, or null when the plan is not an insider one.
 *
 * Falls back to the period's end for a server from before terms were sent:
 * a date that is too early is still better than drawing an insider plan as a
 * subscription with a store to manage it in.
 */
export function insiderEndsAt(balance: InsiderStanding): string | null {
  if (balance.source !== 'insider') return null;
  return balance.termEndsAt ?? balance.periodEndsAt;
}

/** The credit meter's word on it: "insider plan until 13 Oct 2027". */
export function insiderMeterDetail(balance: InsiderStanding): string | null {
  if (balance.source !== 'insider') return null;
  const ends = formatTermDate(insiderEndsAt(balance));
  return ends ? `insider plan until ${ends}` : 'insider plan';
}

/** The line under the plan's name in its management sheet. */
export function insiderPlanDetail(plan: PlanId, balance: InsiderStanding): string {
  const neurons = CREDIT_PLANS[plan].monthlyCredits.toLocaleString('en-US');
  const ends = formatTermDate(insiderEndsAt(balance));
  // One period is the whole term: a single grant, not a monthly one.
  const single = balance.termEndsAt != null && balance.termEndsAt === balance.periodEndsAt;
  const grant = single ? `${neurons} neurons` : `${neurons} neurons each month`;
  return ends ? `${grant}, until ${ends}` : grant;
}
