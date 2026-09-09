/**
 * What a plan's three card lines mean, in numbers a reader can check.
 *
 * The plan card is terse on purpose: three ticks, no essay. The info sheet
 * behind it carries the explanation, and this is where its facts are derived
 * - purely, so the sentences and the arithmetic cannot drift apart. No
 * dollars appear anywhere in here: the estimate divides credits by credits,
 * both of them the server's own numbers.
 */
import { planIncludes, type CreditPlan } from 'samwell-shared';

/** The shape the sheet needs. A structural slice of the store's `PlanModel`. */
export interface PlanFactModel {
  label: string;
  minPlan: CreditPlan['id'];
  /** Credits a typical message costs, by the server's estimate. Null when
   * the model has no price, in which case it cannot anchor a sentence. */
  forecastCredits: number | null;
}

export interface PlanFacts {
  /** Model names this plan reaches, in the catalogue's own order. */
  modelLabels: string[];
  /**
   * The floor on a month's conversations: the grant divided by the DEAREST
   * model's per-message estimate, rounded down to two figures. The dearest
   * model is the anchor because it is the only promise that cannot be
   * broken - a reader who picks anything else gets more than the number
   * said, never less.
   */
  conversationsFloor: number | null;
  /** The name of that dearest model, so the sentence can name its anchor. */
  dearestLabel: string | null;
  /**
   * The rollover example's numbers: what is left after spending 60% of the
   * grant, and the total next month starts on. Forty per cent, because the
   * example has to land under the rollover cap (half the grant) for the
   * addition to be true without a caveat in the middle of it.
   */
  rolloverLeft: number;
  rolloverSum: number;
}

export function planFacts(plan: CreditPlan, models: readonly PlanFactModel[]): PlanFacts {
  const reached = models.filter((model) => planIncludes(plan.id, model.minPlan));

  let dearest: PlanFactModel | null = null;
  for (const model of reached) {
    if (model.forecastCredits == null) continue;
    if (!dearest || model.forecastCredits > (dearest.forecastCredits ?? 0)) {
      dearest = model;
    }
  }

  return {
    modelLabels: reached.map((model) => model.label),
    conversationsFloor:
      dearest?.forecastCredits != null
        ? roundDownToHundreds(plan.monthlyCredits / dearest.forecastCredits)
        : null,
    dearestLabel: dearest?.label ?? null,
    rolloverLeft: Math.round(plan.monthlyCredits * 0.4),
    rolloverSum: Math.round(plan.monthlyCredits * 1.4),
  };
}

/**
 * 625 becomes 600, 1,250 becomes 1,200: down, never up, so "roughly"
 * under-promises. Whole hundreds, because "roughly 620" is a precision the
 * estimate cannot back - the hundreds digit is the honesty digit here.
 * Below a hundred there is no hundreds digit to keep, and the floor is just
 * the floor.
 */
function roundDownToHundreds(n: number): number {
  if (n <= 0) return 0;
  if (n < 100) return Math.floor(n);
  return Math.floor(n / 100) * 100;
}
