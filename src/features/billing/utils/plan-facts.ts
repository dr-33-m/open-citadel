/**
 * What a plan's three card lines mean, in numbers a reader can check.
 *
 * The plan card is terse on purpose: three ticks, no essay. The info sheet
 * behind it carries the explanation, and this is where its facts are derived
 * - purely, so the sentences and the arithmetic cannot drift apart. No
 * dollars appear anywhere in here: every estimate divides credits by
 * credits, both of them the server's own numbers.
 */
import { planIncludes, type CreditPlan } from 'samwell-shared';

/** The shape the sheet needs. A structural slice of the store's `PlanModel`. */
export interface PlanFactModel {
  id: string;
  label: string;
  provider: string;
  minPlan: CreditPlan['id'];
  /** Credits a typical message costs, by the server's estimate. Null when
   * the model has no price, in which case it cannot anchor a number. */
  forecastCredits: number | null;
}

export interface PlanFacts {
  /** The models this plan reaches, in the catalogue's own order. */
  models: PlanFactModel[];
  /**
   * Conversations a month, per model id, rounded down to whole hundreds.
   *
   * Rounded rather than exact because the estimate behind it is a forecast;
   * down rather than nearest because a number a reader is deciding on should
   * under-promise. Priced models only.
   */
  estimates: Record<string, number>;
  /**
   * The model id the sheet opens on: the DEAREST in the plan, whose estimate
   * is the floor. The one promise that cannot be broken - a reader who picks
   * anything else in the browse control gets a bigger number, never smaller.
   */
  defaultModelId: string | null;
}

export function planFacts(plan: CreditPlan, models: readonly PlanFactModel[]): PlanFacts {
  const reached = models.filter((model) => planIncludes(plan.id, model.minPlan));

  const estimates: Record<string, number> = {};
  let defaultModelId: string | null = null;
  let dearestCost = 0;
  for (const model of reached) {
    if (model.forecastCredits == null || model.forecastCredits <= 0) continue;
    estimates[model.id] = roundDownToHundreds(plan.monthlyCredits / model.forecastCredits);
    if (model.forecastCredits > dearestCost) {
      dearestCost = model.forecastCredits;
      defaultModelId = model.id;
    }
  }

  return { models: reached, estimates, defaultModelId };
}

/**
 * 625 becomes 600, 1,250 becomes 1,200: down, never up, so "roughly"
 * under-promises. Whole hundreds, because "roughly 620" is a precision the
 * estimate cannot back - the hundreds digit is the honesty digit here.
 * Below a hundred there is no hundreds digit to keep, and the floor is just
 * the floor.
 */
export function roundDownToHundreds(n: number): number {
  if (n <= 0) return 0;
  if (n < 100) return Math.floor(n);
  return Math.floor(n / 100) * 100;
}
