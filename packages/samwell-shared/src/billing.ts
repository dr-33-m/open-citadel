/**
 * What a subscription buys, and what a turn costs.
 *
 * Both halves live here because the server and the app must never disagree
 * about what a credit is worth. The server charges in credits; the app draws a
 * balance and an estimate in credits; a second copy of the arithmetic is a
 * second chance for the two to drift, and this codebase has already watched
 * that happen with the model-readiness checks.
 *
 * Pure and dependency-free, so it can be unit tested on its own.
 */

/** The three plans, cheapest first. Order is meaningful: see `planRank`. */
export type PlanId = 'maester' | 'grand_maester' | 'archmaester';

export const PLAN_ORDER: readonly PlanId[] = [
  'maester',
  'grand_maester',
  'archmaester',
] as const;

export interface CreditPlan {
  id: PlanId;
  /** Shown on the plan card. Samwell is a person, so the plans are his titles. */
  label: string;
  /** The RevenueCat entitlement lookup key. One per plan, one plan per key. */
  entitlement: string;
  /**
   * The RevenueCat package identifier inside the `default` offering.
   *
   * Named here beside the entitlement so there is one place the RevenueCat
   * objects are written down. Matching a package to a plan by pattern instead
   * would be wrong the first time it was tried: `$rc_monthly_maester` is a
   * suffix of `$rc_monthly_grand_maester`, so the cheap plan would swallow
   * the dearer one's card.
   */
  packageId: string;
  priceUsd: number;
  /** What lands in the ledger on the first purchase and every renewal. */
  monthlyCredits: number;
  /**
   * The share of the subscription that pays for inference.
   *
   * Not margin left over: this is the number the credit grant is derived FROM.
   * `creditValueUsd` divides one by the other, so changing either here changes
   * what a credit is worth and nothing else has to be touched.
   */
  aiBudgetUsd: number;
  /**
   * How many unused credits may carry into the next month.
   *
   * Half a grant. Generous enough that a light month is not punished, bounded
   * enough that a year of light use cannot become a balance that empties the
   * AI budget in a week.
   */
  rolloverCap: number;
}

export const CREDIT_PLANS: Record<PlanId, CreditPlan> = {
  maester: {
    id: 'maester',
    label: 'Maester Samwell',
    entitlement: 'maester',
    packageId: '$rc_monthly_maester',
    priceUsd: 6,
    monthlyCredits: 2_500,
    aiBudgetUsd: 2,
    rolloverCap: 1_250,
  },
  grand_maester: {
    id: 'grand_maester',
    label: 'Grand Maester Samwell',
    entitlement: 'grand_maester',
    packageId: '$rc_monthly_grand_maester',
    priceUsd: 20,
    monthlyCredits: 10_000,
    aiBudgetUsd: 8,
    rolloverCap: 5_000,
  },
  archmaester: {
    id: 'archmaester',
    label: 'Archmaester Samwell',
    entitlement: 'archmaester',
    packageId: '$rc_monthly_archmaester',
    priceUsd: 50,
    monthlyCredits: 30_000,
    aiBudgetUsd: 24,
    rolloverCap: 15_000,
  },
};

export const PLANS: CreditPlan[] = PLAN_ORDER.map((id) => CREDIT_PLANS[id]);

/**
 * What one credit is worth, in dollars.
 *
 * Derived, never written down. The temptation is to put `0.0008` in a constant
 * and be done, and it is wrong for the reason every duplicated decision is
 * wrong: the day a budget moves, one of the two numbers gets updated and the
 * other quietly starts lying. The budget and the grant are the inputs; this is
 * the only place they are divided.
 *
 * It comes out the same on all three plans today, which is deliberate. A
 * credit means one thing whatever somebody pays, so "7,423 credits" is a
 * number a reader can carry with them if they change plan.
 */
export function creditValueUsd(plan: CreditPlan): number {
  return plan.aiBudgetUsd / plan.monthlyCredits;
}

export function planRank(plan: PlanId): number {
  return PLAN_ORDER.indexOf(plan);
}

/**
 * Whether somebody on `held` can reach something gated at `needed`.
 *
 * Access is cumulative: Archmaester reaches all nine models, Maester reaches
 * three. A reader who pays more can still pick a cheap model, which is the
 * point - it is their balance, and spending it slowly is a legitimate choice.
 */
export function planIncludes(held: PlanId, needed: PlanId): boolean {
  return planRank(held) >= planRank(needed);
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in CREDIT_PLANS;
}

/** The plan a RevenueCat package identifier names, or null if it names none. */
export function planForPackage(packageId: string): PlanId | null {
  const found = PLANS.find((plan) => plan.packageId === packageId);
  return found ? found.id : null;
}

/** The plan a RevenueCat entitlement key names, or null if it names none. */
export function planForEntitlement(lookupKey: string): PlanId | null {
  const found = PLANS.find((plan) => plan.entitlement === lookupKey);
  return found ? found.id : null;
}

/**
 * The highest plan among the entitlements a customer holds.
 *
 * A customer can hold more than one at a time - an insider grant beside a
 * purchase, or the overlap during an upgrade - and the answer is always the
 * best of them rather than the first one read.
 */
export function bestPlan(entitlementKeys: readonly string[]): PlanId | null {
  let best: PlanId | null = null;
  for (const key of entitlementKeys) {
    const plan = planForEntitlement(key);
    if (plan && (best === null || planRank(plan) > planRank(best))) best = plan;
  }
  return best;
}

// -- Cost --------------------------------------------------------------------

/**
 * A model's prices, per million tokens.
 *
 * Never hardcoded anywhere. These are pulled from OpenRouter's own model
 * metadata and stored on the catalog row, because providers change them and a
 * table of numbers written into the app is wrong the month after it is
 * written. A usage record also snapshots the two it was charged at, so a
 * historical row stays accurate after a price change.
 */
export interface ModelPricing {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  /**
   * What a cached input token costs, when the provider caches at all.
   *
   * Not a rounding detail. Samwell re-sends a persona, a book grounding and
   * thirty-three tool schemas on every turn, and measurement on real traffic
   * put the median call at 95% cached. Ignoring this overstates the cost of a
   * conversation by roughly two and a half times, which would have meant
   * pricing the plans for money nobody was going to spend.
   *
   * Null means the provider does not publish one, and every token is charged
   * at the full input rate.
   */
  cachedInputPricePerMillion: number | null;
}

/** Tokens one turn actually used. `cachedInputTokens` is a subset of `inputTokens`. */
export interface TokenWorkload {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

const PER_MILLION = 1_000_000;

export function modelCostUsd(pricing: ModelPricing, workload: TokenWorkload): number {
  const cached = Math.max(0, Math.min(workload.cachedInputTokens, workload.inputTokens));
  const fresh = Math.max(0, workload.inputTokens - cached);
  const cachedRate = pricing.cachedInputPricePerMillion ?? pricing.inputPricePerMillion;

  return (
    (fresh / PER_MILLION) * pricing.inputPricePerMillion +
    (cached / PER_MILLION) * cachedRate +
    (Math.max(0, workload.outputTokens) / PER_MILLION) * pricing.outputPricePerMillion
  );
}

/**
 * Dollars to credits, always rounded up.
 *
 * Up rather than nearest, so a long run of very cheap turns can never add up
 * to real spend that was charged as nothing. The floor is one credit per
 * turn, which on the cheapest model is worth less than a tenth of a cent and
 * is the price of having a number to show at all.
 */
export function costToCredits(costUsd: number, creditValue: number): number {
  if (!(creditValue > 0)) return 0;
  return Math.max(1, Math.ceil(costUsd / creditValue));
}

// -- Forecasting -------------------------------------------------------------

/**
 * The turn a "typical message" estimate is priced against.
 *
 * Seeded from real traffic rather than modelled: the p75 turn in the
 * OpenRouter activity export, where 201 user turns were grouped from 734 API
 * calls. p75 rather than the median because an estimate shown to a reader
 * should under-promise, and well below the mean because the mean is dragged by
 * a runaway-tool-loop tail that the loop ceiling exists to prevent.
 *
 * One user turn, not one API call. Samwell's tools are client tools, so a
 * single message can be several round trips and any per-message number that
 * counts calls is wrong by about four times.
 *
 * The server overrides all three from `server_settings`, and a weekly job
 * recomputes them from real usage. These are the seed, not the truth.
 */
export const FORECAST_WORKLOAD: TokenWorkload = {
  inputTokens: 12_817,
  cachedInputTokens: 10_611,
  outputTokens: 458,
};

/**
 * How many of a turn's prompt tokens to charge at the cached rate.
 *
 * Prefers what the provider reported, and falls back to a share only when
 * nothing was reported. The direction matters and is not symmetric: assuming
 * LESS caching than really happened bills a reader for fresh tokens at ten
 * times the price they actually cost, so a reported number is always taken
 * over a guess. On real traffic the median call was 95% cached, so the gap
 * between the two is most of what a turn costs.
 *
 * Clamped to the prompt itself, because a provider reporting more cached
 * tokens than it read would otherwise make a turn cost less than nothing.
 */
export function resolveCachedTokens(
  promptTokens: number,
  reportedCachedTokens: number | null | undefined,
  fallbackShare: number,
): number {
  const prompt = Math.max(0, promptTokens);
  const reported =
    typeof reportedCachedTokens === 'number' && Number.isFinite(reportedCachedTokens)
      ? Math.max(0, reportedCachedTokens)
      : null;
  const share = Math.min(1, Math.max(0, fallbackShare));
  return Math.min(prompt, reported ?? Math.floor(prompt * share));
}

export function forecastCostUsd(
  pricing: ModelPricing,
  workload: TokenWorkload = FORECAST_WORKLOAD,
): number {
  return modelCostUsd(pricing, workload);
}

/**
 * The estimate a reader is shown, in credits.
 *
 * Takes the credit value explicitly rather than assuming a plan: the value is
 * the same on all three plans today, and if that ever stops being true, the
 * estimate should be in the reader's own credits, which is the only kind they
 * can count.
 */
export function forecastCredits(
  pricing: ModelPricing,
  creditValue: number,
  workload: TokenWorkload = FORECAST_WORKLOAD,
): number {
  return costToCredits(forecastCostUsd(pricing, workload), creditValue);
}

/**
 * The dearest priced model in a set.
 *
 * The caller supplies the cost because some surfaces already hold forecast
 * credits while the server holds raw prices. Keeping the choice here means
 * both still agree that a plan defaults to its most expensive brain. Ties
 * preserve catalogue order, and unpriced models cannot become the default.
 */
export function mostExpensiveModelId<T extends { id: string }>(
  models: readonly T[],
  costOf: (model: T) => number | null | undefined,
): string | null {
  let selectedId: string | null = null;
  let selectedCost = 0;

  for (const model of models) {
    const cost = costOf(model);
    if (cost == null || !Number.isFinite(cost) || cost <= selectedCost) continue;
    selectedId = model.id;
    selectedCost = cost;
  }

  return selectedId;
}

/**
 * `1x`-style multipliers for a set of models, each against its own band.
 *
 * The multiplier is a ratio of forecast costs, so the credit value cancels
 * out and never enters this function. The band a model is compared within is
 * the tier its `minPlan` names, because access is cumulative: an Archmaester
 * sees the flash models too, and reading Opus as `125x` beside a flash model
 * turns a gentle nudge into a warning label. Within its band the number says
 * the thing a reader actually wants to know: of the models at this tier, how
 * dear is this one.
 *
 * Models without prices get a multiplier of 1 and are excluded from the
 * baseline: an unknown price must not set the yardstick other models are
 * measured against. The absolute estimate beside the multiplier carries the
 * truth anyway, and it is null for the same models.
 */
export function forecastMultipliersByBand(
  models: readonly {
    id: string;
    minPlan: PlanId;
    inputPricePerMillion: number | null;
    outputPricePerMillion: number | null;
    cachedInputPricePerMillion: number | null;
  }[],
  workload: TokenWorkload = FORECAST_WORKLOAD,
): Record<string, number> {
  const bandBaseline = new Map<PlanId, number>();
  const costs = new Map<string, number>();

  for (const model of models) {
    if (model.inputPricePerMillion == null || model.outputPricePerMillion == null) continue;
    const cost = modelCostUsd(
      {
        inputPricePerMillion: model.inputPricePerMillion,
        outputPricePerMillion: model.outputPricePerMillion,
        cachedInputPricePerMillion: model.cachedInputPricePerMillion,
      },
      workload,
    );
    costs.set(model.id, cost);
    const baseline = bandBaseline.get(model.minPlan);
    if (baseline === undefined || cost < baseline) bandBaseline.set(model.minPlan, cost);
  }

  const result: Record<string, number> = {};
  for (const model of models) {
    const cost = costs.get(model.id);
    const baseline = bandBaseline.get(model.minPlan);
    result[model.id] = cost !== undefined && baseline !== undefined && baseline > 0
      ? cost / baseline
      : 1;
  }
  return result;
}

/**
 * How much dearer this model is than the cheapest one in its own band.
 *
 * A display device and nothing more. The charge is always real tokens at real
 * prices (see `modelCostUsd`); multiplying a charge by this as well would
 * count the model's expense twice.
 *
 * Compared within the band a model was added at, rather than against the
 * cheapest model the reader can see. Access is cumulative, so an Archmaester's
 * cheapest visible model is a flash model at about one credit - which would
 * put Opus at 125x and turn a gentle nudge into a warning label. Within its
 * band the number says the thing a reader actually wants to know: of the
 * models at this tier, how dear is this one.
 *
 * The absolute estimate sits beside it and carries the truth.
 */
export function forecastMultiplier(cost: number, baselineCost: number): number {
  if (!(baselineCost > 0)) return 1;
  return cost / baselineCost;
}

/** `1x`, `1.3x`, `12x`. One decimal below ten, whole numbers above. */
export function formatMultiplier(multiplier: number): string {
  const rounded = multiplier >= 10 ? Math.round(multiplier) : Math.round(multiplier * 10) / 10;
  return `${rounded}x`;
}

// -- Balance -----------------------------------------------------------------

export type CreditSource = 'subscription' | 'insider';

export type LedgerEntryType =
  | 'MONTHLY_GRANT'
  | 'AI_USAGE'
  | 'REFUND'
  | 'ADMIN_ADJUSTMENT'
  | 'EXPIRATION';

/**
 * What the app draws, and what `GET /billing/me` answers.
 *
 * `available` is `balance - reserved` and is the only one of the three a
 * reader is ever shown. Reserved credits belong to turns already in flight;
 * showing a balance that includes them would let somebody start a message the
 * server is about to refuse.
 */
export interface CreditBalance {
  plan: PlanId | null;
  source: CreditSource | null;
  balance: number;
  reserved: number;
  available: number;
  /** The plan's monthly grant, for drawing a meter against. */
  grant: number;
  periodEndsAt: string | null;
}

export const NO_PLAN_BALANCE: CreditBalance = {
  plan: null,
  source: null,
  balance: 0,
  reserved: 0,
  available: 0,
  grant: 0,
  periodEndsAt: null,
};

/**
 * The balance after a renewal lands.
 *
 * Rollover is capped rather than uncapped, so what the house may owe in any
 * one month is bounded. Anything above the cap is written off, and the caller
 * records that as an `EXPIRATION` row so a reader can see it happened rather
 * than finding credits quietly missing.
 */
export function applyMonthlyGrant(
  currentBalance: number,
  plan: CreditPlan,
): { balance: number; granted: number; expired: number } {
  const carried = Math.min(Math.max(0, currentBalance), plan.rolloverCap);
  const expired = Math.max(0, currentBalance - carried);
  return {
    balance: carried + plan.monthlyCredits,
    granted: plan.monthlyCredits,
    expired,
  };
}
