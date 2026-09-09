import { describe, expect, it } from 'vitest';

import { CREDIT_PLANS, type PlanId } from 'samwell-shared';

import { planFacts, roundDownToHundreds } from '../plan-facts';

const MODELS = [
  { id: 'z-ai/glm', label: 'Z.ai: GLM 5.3 Flash', provider: 'Z.ai', minPlan: 'maester' as PlanId, forecastCredits: 2 },
  { id: 'openai/luna', label: 'OpenAI: GPT-5.6 Luna', provider: 'OpenAI', minPlan: 'maester' as PlanId, forecastCredits: 2 },
  { id: 'deepseek/flash', label: 'DeepSeek: DeepSeek V4 Flash 0731', provider: 'DeepSeek', minPlan: 'maester' as PlanId, forecastCredits: 2 },
  { id: 'google/gemini-25', label: 'Google: Gemini 2.5 Pro', provider: 'Google', minPlan: 'grand_maester' as PlanId, forecastCredits: 11 },
  { id: 'anthropic/sonnet-5', label: 'Anthropic: Claude Sonnet 5', provider: 'Anthropic', minPlan: 'grand_maester' as PlanId, forecastCredits: 14 },
  { id: 'x-ai/grok-46', label: 'X.ai: Grok 4.6', provider: 'X.ai', minPlan: 'grand_maester' as PlanId, forecastCredits: 16 },
  { id: 'openai/sol-pro', label: 'OpenAI: GPT-5.6 Sol Pro', provider: 'OpenAI', minPlan: 'archmaester' as PlanId, forecastCredits: 14 },
  { id: 'google/gemini-31', label: 'Google: Gemini 3.1 Pro', provider: 'Google', minPlan: 'archmaester' as PlanId, forecastCredits: 15 },
  { id: 'anthropic/opus-5', label: 'Anthropic: Claude Opus 5', provider: 'Anthropic', minPlan: 'archmaester' as PlanId, forecastCredits: 35 },
];

describe('planFacts', () => {
  it('lists the models the plan reaches, and nothing above it', () => {
    expect(planFacts(CREDIT_PLANS.maester, MODELS).models).toHaveLength(3);
    expect(planFacts(CREDIT_PLANS.grand_maester, MODELS).models).toHaveLength(6);
    expect(planFacts(CREDIT_PLANS.archmaester, MODELS).models).toHaveLength(9);
  });

  it('estimates conversations per model, floored to whole hundreds', () => {
    const grand = planFacts(CREDIT_PLANS.grand_maester, MODELS);
    expect(grand.estimates['x-ai/grok-46']).toBe(600); // 10,000 / 16 = 625
    expect(grand.estimates['anthropic/sonnet-5']).toBe(700); // 714
    expect(grand.estimates['z-ai/glm']).toBe(5_000); // 10,000 / 2
  });

  it('opens on the dearest model, whose estimate is the floor', () => {
    // The only promise that cannot be broken: whatever the reader browses to,
    // the number they opened on was the smallest on offer.
    const grand = planFacts(CREDIT_PLANS.grand_maester, MODELS);
    expect(grand.defaultModelId).toBe('x-ai/grok-46');
    expect(grand.estimates[grand.defaultModelId!]).toBe(600);

    const arch = planFacts(CREDIT_PLANS.archmaester, MODELS);
    expect(arch.defaultModelId).toBe('anthropic/opus-5');
    expect(arch.estimates[arch.defaultModelId!]).toBe(800); // 857
  });

  it('rounds down, never up, so roughly under-promises', () => {
    expect(roundDownToHundreds(625)).toBe(600);
    expect(roundDownToHundreds(857)).toBe(800);
    expect(roundDownToHundreds(1250)).toBe(1200);
    expect(roundDownToHundreds(99)).toBe(99);
    expect(roundDownToHundreds(0)).toBe(0);
  });

  it('skips unpriced models in the estimates but keeps them in the list', () => {
    const facts = planFacts(CREDIT_PLANS.maester, [
      { id: 'priced', label: 'Priced', provider: 'P', minPlan: 'maester' as PlanId, forecastCredits: 2 },
      { id: 'mystery', label: 'Mystery', provider: 'M', minPlan: 'maester' as PlanId, forecastCredits: null },
    ]);
    expect(facts.models.map((m) => m.label)).toEqual(['Priced', 'Mystery']);
    expect(facts.estimates['mystery']).toBeUndefined();
    expect(facts.defaultModelId).toBe('priced');
  });

  it('answers empty for a plan with nothing priced behind it', () => {
    const facts = planFacts(CREDIT_PLANS.archmaester, [
      { id: 'mystery', label: 'Mystery', provider: 'M', minPlan: 'archmaester' as PlanId, forecastCredits: null },
    ]);
    expect(facts.models).toHaveLength(1);
    expect(facts.estimates).toEqual({});
    expect(facts.defaultModelId).toBeNull();
  });
});
