import { describe, expect, it } from 'vitest';

import { CREDIT_PLANS, type PlanId } from 'samwell-shared';

import { planFacts } from '../plan-facts';

const MODELS = [
  { label: 'Qwen Flash', minPlan: 'maester' as PlanId, forecastCredits: 1 },
  { label: 'GLM Flash', minPlan: 'maester' as PlanId, forecastCredits: 2 },
  { label: 'DeepSeek Flash', minPlan: 'maester' as PlanId, forecastCredits: 2 },
  { label: 'Gemini Pro', minPlan: 'grand_maester' as PlanId, forecastCredits: 11 },
  { label: 'Claude Sonnet 5', minPlan: 'grand_maester' as PlanId, forecastCredits: 14 },
  { label: 'Grok 4.6', minPlan: 'grand_maester' as PlanId, forecastCredits: 16 },
  { label: 'GPT 5.6 Sol', minPlan: 'archmaester' as PlanId, forecastCredits: 14 },
  { label: 'Gemini 3.1 Pro', minPlan: 'archmaester' as PlanId, forecastCredits: 15 },
  { label: 'Claude Opus 5', minPlan: 'archmaester' as PlanId, forecastCredits: 35 },
];

describe('planFacts', () => {
  it('lists the models the plan reaches, and nothing above it', () => {
    const facts = planFacts(CREDIT_PLANS.maester, MODELS);
    expect(facts.modelLabels).toEqual(['Qwen Flash', 'GLM Flash', 'DeepSeek Flash']);

    const grand = planFacts(CREDIT_PLANS.grand_maester, MODELS);
    expect(grand.modelLabels).toHaveLength(6);

    const arch = planFacts(CREDIT_PLANS.archmaester, MODELS);
    expect(arch.modelLabels).toHaveLength(9);
  });

  it('anchors the conversation floor on the dearest model the plan reaches', () => {
    // The only promise that cannot be broken: whatever the reader picks, they
    // get at least this many. Maester's dearest is 2 credits a message, so
    // 2,500 credits is 1,250 conversations, said as 1,200.
    const facts = planFacts(CREDIT_PLANS.maester, MODELS);
    expect(facts.dearestLabel).toBe('GLM Flash');
    expect(facts.conversationsFloor).toBe(1_200);

    // Grand Maester's dearest is Grok 4.6 at 16: 10,000 / 16 = 625, said as
    // 600. Not Sonnet's 714, however friendlier that number would read.
    const grand = planFacts(CREDIT_PLANS.grand_maester, MODELS);
    expect(grand.dearestLabel).toBe('Grok 4.6');
    expect(grand.conversationsFloor).toBe(600);

    const arch = planFacts(CREDIT_PLANS.archmaester, MODELS);
    expect(arch.dearestLabel).toBe('Claude Opus 5');
    expect(arch.conversationsFloor).toBe(800);
  });

  it('rounds down, never up, so roughly under-promises', () => {
    const models = [
      { label: 'One', minPlan: 'maester' as PlanId, forecastCredits: 3 },
    ];
    // 2,500 / 3 = 833.3 -> 800, not 833 and not 900.
    expect(planFacts(CREDIT_PLANS.maester, models).conversationsFloor).toBe(800);
  });

  it('ignores unpriced models as an anchor but keeps their names', () => {
    const models = [
      { label: 'Priced', minPlan: 'maester' as PlanId, forecastCredits: 2 },
      { label: 'Mystery', minPlan: 'maester' as PlanId, forecastCredits: null },
    ];
    const facts = planFacts(CREDIT_PLANS.maester, models);
    expect(facts.modelLabels).toEqual(['Priced', 'Mystery']);
    expect(facts.dearestLabel).toBe('Priced');
    expect(facts.conversationsFloor).toBe(1_200);
  });

  it('answers nulls for a plan with nothing priced behind it', () => {
    const facts = planFacts(CREDIT_PLANS.archmaester, [
      { label: 'Mystery', minPlan: 'archmaester' as PlanId, forecastCredits: null },
    ]);
    expect(facts.conversationsFloor).toBeNull();
    expect(facts.dearestLabel).toBeNull();
    expect(facts.modelLabels).toEqual(['Mystery']);
  });

  it('builds a rollover example that lands under the cap', () => {
    // The addition must be true without a caveat in the middle of it: the
    // leftover is 40% of the grant, and every cap is 50%, so the example
    // never trips the write-off.
    for (const plan of Object.values(CREDIT_PLANS)) {
      const facts = planFacts(plan, MODELS);
      expect(facts.rolloverLeft + plan.monthlyCredits).toBe(facts.rolloverSum);
      expect(facts.rolloverLeft).toBeLessThanOrEqual(plan.rolloverCap);
    }
    expect(planFacts(CREDIT_PLANS.grand_maester, MODELS).rolloverLeft).toBe(4_000);
    expect(planFacts(CREDIT_PLANS.grand_maester, MODELS).rolloverSum).toBe(14_000);
  });
});
