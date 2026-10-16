import { PLAN_ORDER, type PlanId } from 'samwell-shared';

export interface BrainTier<M> {
  plan: PlanId;
  models: M[];
}

/**
 * The brains a plan reaches, a tier to a group: the plan's own first, then
 * each tier beneath it, dearest first. Access is cumulative, so an
 * Archmaester reaches all three; the ones they pay for lead. Tiers above the
 * plan are not listed (the plans sheet is where plans are sold), and a tier
 * with no brains in it is left out. No plan reads as the first one.
 */
export function brainTiers<M extends { minPlan: PlanId }>(models: readonly M[], plan: PlanId | null): BrainTier<M>[] {
  const held = PLAN_ORDER.indexOf(plan ?? PLAN_ORDER[0]);
  return PLAN_ORDER.slice(0, held + 1)
    .reverse()
    .map((tier) => ({ plan: tier, models: models.filter((model) => model.minPlan === tier) }))
    .filter((tier) => tier.models.length > 0);
}

/** The tier a sheet opens on: the one holding the chosen brain, else the plan's own. */
export function openingTier<M extends { id: string }>(tiers: readonly BrainTier<M>[], activeId: string | null): PlanId | null {
  const holding = tiers.find((tier) => tier.models.some((model) => model.id === activeId));
  return (holding ?? tiers[0])?.plan ?? null;
}
