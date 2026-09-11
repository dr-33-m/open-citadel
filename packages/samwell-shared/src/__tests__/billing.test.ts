import { describe, expect, it } from 'vitest';

import {
    CREDIT_PLANS,
    FORECAST_WORKLOAD,
    PLANS,
    PLAN_ORDER,
    applyMonthlyGrant,
    bestPlan,
    costToCredits,
    creditValueUsd,
    forecastCostUsd,
    forecastCredits,
    forecastMultiplier,
    forecastMultipliersByBand,
    formatMultiplier,
    modelCostUsd,
    mostExpensiveModelId,
    planForEntitlement,
    planForPackage,
    planIncludes,
    resolveCachedTokens,
    type ModelPricing,
    type PlanId,
} from '../billing';
import { CLOUD_MODEL_CATALOG, modelsForPlan } from '../models';

describe('credit value', () => {
  it('derives the same value on every plan', () => {
    // A credit has to mean one thing whatever somebody pays, so a balance
    // survives a plan change without being re-explained.
    const values = PLANS.map(creditValueUsd);
    for (const value of values) expect(value).toBeCloseTo(0.0008, 10);
  });

  it('is derived from the budget rather than written down', () => {
    // The guard against the literal drifting away from the plan it came from.
    for (const plan of PLANS) {
      expect(creditValueUsd(plan)).toBe(plan.aiBudgetUsd / plan.monthlyCredits);
    }
  });

  it('spends exactly the AI budget when a grant is fully used', () => {
    for (const plan of PLANS) {
      expect(plan.monthlyCredits * creditValueUsd(plan)).toBeCloseTo(plan.aiBudgetUsd, 10);
    }
  });
});

describe('cost to credits', () => {
  const creditValue = 0.0008;

  it('matches the worked example from the specification', () => {
    // 10,000 in at $1.40/M and 2,000 out at $4.40/M is $0.0228, which is
    // 28.5 credits, which is charged as 29.
    const pricing: ModelPricing = {
      inputPricePerMillion: 1.4,
      outputPricePerMillion: 4.4,
      cachedInputPricePerMillion: null,
    };
    const cost = modelCostUsd(pricing, {
      inputTokens: 10_000,
      cachedInputTokens: 0,
      outputTokens: 2_000,
    });
    expect(cost).toBeCloseTo(0.0228, 10);
    expect(costToCredits(cost, creditValue)).toBe(29);
  });

  it('rounds up, so cheap turns can never add up to unbilled spend', () => {
    expect(costToCredits(0.00081, creditValue)).toBe(2);
    expect(costToCredits(0.0008, creditValue)).toBe(1);
  });

  it('never charges nothing for a turn that happened', () => {
    expect(costToCredits(0.0000001, creditValue)).toBe(1);
    expect(costToCredits(0, creditValue)).toBe(1);
  });
});

describe('cached input', () => {
  const pricing: ModelPricing = {
    inputPricePerMillion: 2,
    outputPricePerMillion: 10,
    cachedInputPricePerMillion: 0.2,
  };

  it('charges the cached rate for the cached share', () => {
    const cost = modelCostUsd(pricing, {
      inputTokens: 10_000,
      cachedInputTokens: 9_000,
      outputTokens: 0,
    });
    // 1,000 fresh at $2/M plus 9,000 cached at $0.20/M.
    expect(cost).toBeCloseTo(0.002 + 0.0018, 10);
  });

  it('falls back to the full rate when the provider does not cache', () => {
    const uncached: ModelPricing = { ...pricing, cachedInputPricePerMillion: null };
    const workload = { inputTokens: 10_000, cachedInputTokens: 9_000, outputTokens: 0 };
    expect(modelCostUsd(uncached, workload)).toBeCloseTo(0.02, 10);
  });

  it('cannot report more cached tokens than were sent', () => {
    const cost = modelCostUsd(pricing, {
      inputTokens: 1_000,
      cachedInputTokens: 9_999,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo(0.0002, 10);
  });
});

describe('resolveCachedTokens', () => {
  const share = 0.828;

  it('believes the provider over the guess', () => {
    // The bug this exists to prevent: assuming 82.8% cached when the provider
    // actually cached 95% bills the reader for fresh tokens at ten times what
    // they really cost. On the observed median call that is most of the turn.
    expect(resolveCachedTokens(20_000, 19_000, share)).toBe(19_000);
  });

  it('falls back to the share only when nothing was reported', () => {
    expect(resolveCachedTokens(20_000, null, share)).toBe(16_560);
    expect(resolveCachedTokens(20_000, undefined, share)).toBe(16_560);
  });

  it('charges the real cost when a provider reports no caching at all', () => {
    // Zero is a report, not a missing value, and must not be replaced by the
    // guess - that would undercharge on an uncached provider.
    expect(resolveCachedTokens(20_000, 0, share)).toBe(0);
  });

  it('never claims more cached tokens than were sent', () => {
    // Otherwise a provider over-reporting would make a turn cost less than
    // nothing.
    expect(resolveCachedTokens(1_000, 9_999, share)).toBe(1_000);
  });

  it('is unbothered by nonsense', () => {
    expect(resolveCachedTokens(0, null, share)).toBe(0);
    expect(resolveCachedTokens(-5, null, share)).toBe(0);
    expect(resolveCachedTokens(1_000, -20, share)).toBe(0);
    expect(resolveCachedTokens(1_000, Number.NaN, share)).toBe(828);
    expect(resolveCachedTokens(1_000, null, 5)).toBe(1_000);
  });

  it('costs strictly less when more of the prompt was cached', () => {
    const pricing: ModelPricing = {
      inputPricePerMillion: 2,
      outputPricePerMillion: 10,
      cachedInputPricePerMillion: 0.2,
    };
    const cost = (cached: number | null) =>
      modelCostUsd(pricing, {
        inputTokens: 20_000,
        cachedInputTokens: resolveCachedTokens(20_000, cached, share),
        outputTokens: 500,
      });
    expect(cost(19_000)).toBeLessThan(cost(null));
  });
});

describe('the multiplier is a label, not a charge', () => {
  it('does not change what a fixed workload costs', () => {
    // The whole point of section 10 of the specification. A model being 3x
    // dearer is already in its prices; multiplying the charge by it as well
    // would count the same expense twice.
    const cheap: ModelPricing = {
      inputPricePerMillion: 1,
      outputPricePerMillion: 2,
      cachedInputPricePerMillion: null,
    };
    const dear: ModelPricing = {
      inputPricePerMillion: 3,
      outputPricePerMillion: 6,
      cachedInputPricePerMillion: null,
    };
    const workload = { inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 2_000 };

    const cheapCost = modelCostUsd(cheap, workload);
    const dearCost = modelCostUsd(dear, workload);
    const multiplier = forecastMultiplier(dearCost, cheapCost);

    expect(multiplier).toBeCloseTo(3, 10);
    // The charge is the cost, never the cost times the multiplier.
    expect(costToCredits(dearCost, 0.0008)).toBe(Math.ceil(dearCost / 0.0008));
    expect(costToCredits(dearCost, 0.0008)).not.toBe(
      Math.ceil((cheapCost * multiplier * multiplier) / 0.0008),
    );
  });

  it('formats to one decimal below ten and whole numbers above', () => {
    expect(formatMultiplier(1)).toBe('1x');
    expect(formatMultiplier(1.34)).toBe('1.3x');
    expect(formatMultiplier(12.4)).toBe('12x');
  });

  it('survives a zero baseline rather than dividing by it', () => {
    expect(forecastMultiplier(5, 0)).toBe(1);
  });
});

describe('plan ordering and access', () => {
  it('is cumulative upward and closed downward', () => {
    const expected: Record<PlanId, PlanId[]> = {
      maester: ['maester'],
      grand_maester: ['maester', 'grand_maester'],
      archmaester: ['maester', 'grand_maester', 'archmaester'],
    };
    for (const held of PLAN_ORDER) {
      for (const needed of PLAN_ORDER) {
        expect(planIncludes(held, needed)).toBe(expected[held].includes(needed));
      }
    }
  });

  it('maps package identifiers back to plans exactly', () => {
    // Not by pattern: '$rc_monthly_maester' is a suffix of
    // '$rc_monthly_grand_maester', so anything fuzzy hands the dearer plan's
    // card to the cheaper one.
    for (const plan of PLANS) {
      expect(planForPackage(plan.packageId)).toBe(plan.id);
    }
    expect(planForPackage('$rc_monthly')).toBeNull();
    expect(new Set(PLANS.map((p) => p.packageId)).size).toBe(PLANS.length);
  });

  it('maps entitlement keys back to plans', () => {
    for (const plan of PLANS) {
      expect(planForEntitlement(plan.entitlement)).toBe(plan.id);
    }
    expect(planForEntitlement('something_else')).toBeNull();
  });

  it('takes the best plan when a customer holds more than one', () => {
    expect(bestPlan(['maester', 'archmaester'])).toBe('archmaester');
    expect(bestPlan(['grand_maester'])).toBe('grand_maester');
    expect(bestPlan(['nonsense'])).toBeNull();
    expect(bestPlan([])).toBeNull();
  });
});

describe('the model catalogue', () => {
  it('gives every plan three models of its own', () => {
    for (const plan of PLAN_ORDER) {
      const own = CLOUD_MODEL_CATALOG.filter((model) => model.minPlan === plan);
      expect(own).toHaveLength(3);
    }
  });

  it('opens up more models the higher the plan', () => {
    expect(modelsForPlan(CLOUD_MODEL_CATALOG, 'maester')).toHaveLength(3);
    expect(modelsForPlan(CLOUD_MODEL_CATALOG, 'grand_maester')).toHaveLength(6);
    expect(modelsForPlan(CLOUD_MODEL_CATALOG, 'archmaester')).toHaveLength(9);
  });

  it('defaults every plan to its most expensive reachable model', () => {
    const defaults = Object.fromEntries(
      PLAN_ORDER.map((plan) => [
        plan,
        mostExpensiveModelId(modelsForPlan(CLOUD_MODEL_CATALOG, plan), (model) => {
          if (model.inputPricePerMillion == null || model.outputPricePerMillion == null) {
            return null;
          }
          return modelCostUsd(
            {
              inputPricePerMillion: model.inputPricePerMillion,
              outputPricePerMillion: model.outputPricePerMillion,
              cachedInputPricePerMillion: model.cachedInputPricePerMillion,
            },
            FORECAST_WORKLOAD,
          );
        }),
      ]),
    );

    expect(defaults).toEqual({
      maester: 'openai/gpt-5.6-luna',
      grand_maester: 'openai/gpt-5.6-terra',
      archmaester: 'anthropic/claude-opus-5',
    });
  });

  it('can call tools on every seeded model', () => {
    // Every Samwell surface hands the model tool definitions, so a model that
    // cannot call them is not a choice, it is a broken conversation.
    for (const model of CLOUD_MODEL_CATALOG) {
      expect(model.capabilities).toContain('tools');
    }
  });

  it('keeps every plan inside its AI budget at the forecast turn', () => {
    // The arithmetic the plan cards promise. If a model in a band costs more
    // than its share of the budget, the grant is wrong, not the model.
    for (const plan of PLANS) {
      const models = modelsForPlan(CLOUD_MODEL_CATALOG, plan.id);
      const dearest = Math.max(
        ...models.map((model) =>
          modelCostUsd(
            {
              inputPricePerMillion: model.inputPricePerMillion ?? 0,
              outputPricePerMillion: model.outputPricePerMillion ?? 0,
              cachedInputPricePerMillion: model.cachedInputPricePerMillion,
            },
            FORECAST_WORKLOAD,
          ),
        ),
      );
      const turns = plan.monthlyCredits / costToCredits(dearest, creditValueUsd(plan));
      // A month of the dearest model this plan reaches still has to be worth
      // buying. Fewer than a hundred conversations is not.
      expect(turns).toBeGreaterThan(100);
    }
  });
});

describe('forecasting', () => {
  const creditValue = 0.0008;

  it('chooses the most expensive priced model and preserves order on ties', () => {
    const models = [
      { id: 'unpriced', cost: null },
      { id: 'entry', cost: 4 },
      { id: 'dearest-first', cost: 9 },
      { id: 'dearest-second', cost: 9 },
    ];

    expect(mostExpensiveModelId(models, (model) => model.cost)).toBe('dearest-first');
  });

  it('prices the estimate exactly as a settled turn would be', () => {
    // The estimate and the charge come from the same arithmetic; the only
    // difference is the workload, which is the forecast rather than the
    // reader's actual tokens.
    const pricing: ModelPricing = {
      inputPricePerMillion: 2,
      outputPricePerMillion: 10,
      cachedInputPricePerMillion: 0.2,
    };
    expect(forecastCredits(pricing, creditValue)).toBe(
      costToCredits(forecastCostUsd(pricing), creditValue),
    );
  });

  it('takes the credit value explicitly, so each reader sees it in their own credits', () => {
    const pricing: ModelPricing = {
      inputPricePerMillion: 1,
      outputPricePerMillion: 5,
      cachedInputPricePerMillion: null,
    };
    expect(forecastCredits(pricing, 0.0008)).toBe(
      forecastCredits(pricing, creditValueUsd(CREDIT_PLANS.maester)),
    );
  });

  it('compares each model within its own band, not against the whole visible set', () => {
    // Two bands: a maester band with a flash model and one twice as dear, and
    // an archmaester band whose own entry point resets the baseline.
    const models = [
      { id: 'flash', minPlan: 'maester' as PlanId, inputPricePerMillion: 1, outputPricePerMillion: 2, cachedInputPricePerMillion: null },
      { id: 'dear-maester', minPlan: 'maester' as PlanId, inputPricePerMillion: 2, outputPricePerMillion: 4, cachedInputPricePerMillion: null },
      { id: 'arch-base', minPlan: 'archmaester' as PlanId, inputPricePerMillion: 3, outputPricePerMillion: 6, cachedInputPricePerMillion: null },
      { id: 'arch-dear', minPlan: 'archmaester' as PlanId, inputPricePerMillion: 6, outputPricePerMillion: 12, cachedInputPricePerMillion: null },
    ];
    const multipliers = forecastMultipliersByBand(models);
    expect(multipliers['flash']).toBeCloseTo(1, 10);
    expect(multipliers['dear-maester']).toBeCloseTo(2, 10);
    // The archmaester band's baseline is its own cheapest, not the flash model.
    expect(multipliers['arch-base']).toBeCloseTo(1, 10);
    expect(multipliers['arch-dear']).toBeCloseTo(2, 10);
  });

  it('excludes unpriced models from the baseline and marks them 1', () => {
    const models = [
      { id: 'unknown-price', minPlan: 'maester' as PlanId, inputPricePerMillion: null, outputPricePerMillion: null, cachedInputPricePerMillion: null },
      { id: 'priced', minPlan: 'maester' as PlanId, inputPricePerMillion: 1, outputPricePerMillion: 2, cachedInputPricePerMillion: null },
    ];
    const multipliers = forecastMultipliersByBand(models);
    expect(multipliers['unknown-price']).toBe(1);
    expect(multipliers['priced']).toBe(1);
  });

  it('stays inside the plans at the real catalogue prices', () => {
    // The catalogue is the only set of prices the estimate is ever shown
    // against; every model in every plan needs a number to show.
    const models = modelsForPlan(CLOUD_MODEL_CATALOG, 'archmaester');
    const multipliers = forecastMultipliersByBand(models, FORECAST_WORKLOAD);
    for (const model of models) {
      expect(Number.isFinite(multipliers[model.id])).toBe(true);
      expect(multipliers[model.id]).toBeGreaterThan(0);
    }
  });
});

describe('monthly grant', () => {
  const plan = CREDIT_PLANS.grand_maester;

  it('adds the grant on top of a small leftover', () => {
    const result = applyMonthlyGrant(1_840, plan);
    expect(result.balance).toBe(11_840);
    expect(result.granted).toBe(10_000);
    expect(result.expired).toBe(0);
  });

  it('caps the rollover and records what was written off', () => {
    const result = applyMonthlyGrant(9_000, plan);
    expect(result.balance).toBe(plan.rolloverCap + plan.monthlyCredits);
    expect(result.expired).toBe(9_000 - plan.rolloverCap);
  });

  it('carries exactly the cap without expiring anything', () => {
    const result = applyMonthlyGrant(plan.rolloverCap, plan);
    expect(result.expired).toBe(0);
    expect(result.balance).toBe(plan.rolloverCap + plan.monthlyCredits);
  });

  it('treats a negative balance as nothing carried', () => {
    const result = applyMonthlyGrant(-50, plan);
    expect(result.balance).toBe(plan.monthlyCredits);
    expect(result.expired).toBe(0);
  });
});
