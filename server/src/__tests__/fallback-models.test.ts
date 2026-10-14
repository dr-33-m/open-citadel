import { describe, expect, it } from 'vitest';

import { MAX_FALLBACK_MODELS, pickFallbackModels } from '../fallback-models.js';

const model = (id: string, outputPricePerMillion: number | null, capabilities = ['tools']) => ({
  id,
  capabilities,
  outputPricePerMillion,
});

// Archmaester's reach: every model on sale, cheapest tier first.
const ARCHMAESTER = [
  model('glm-flash', 0.5),
  model('luna-pro', 0.5),
  model('haiku', 0.5),
  model('sonnet', 15),
  model('sol', 12),
  model('deepseek-pro', 3),
  model('opus', 40),
  model('grok', 30),
  model('kimi', 20),
];

describe('pickFallbackModels', () => {
  it('never hands over more than three, however many the plan reaches', () => {
    for (const primary of ARCHMAESTER) {
      const picked = pickFallbackModels(ARCHMAESTER, primary.id);
      expect(picked).toHaveLength(MAX_FALLBACK_MODELS);
      expect(picked.map((m) => m.id)).not.toContain(primary.id);
    }
  });

  it('takes the ones nearest the chosen model in price', () => {
    expect(pickFallbackModels(ARCHMAESTER, 'haiku').map((m) => m.id)).toEqual([
      'glm-flash',
      'luna-pro',
      'deepseek-pro',
    ]);
    expect(pickFallbackModels(ARCHMAESTER, 'opus').map((m) => m.id)).toEqual([
      'grok',
      'kimi',
      'sonnet',
    ]);
  });

  it('keeps a short plan whole', () => {
    const maester = ARCHMAESTER.slice(0, 3);
    expect(pickFallbackModels(maester, 'haiku').map((m) => m.id)).toEqual(['glm-flash', 'luna-pro']);
  });

  it('leaves out a model that cannot call tools', () => {
    const plan = [model('a', 1), model('no-tools', 1, []), model('b', 2)];
    expect(pickFallbackModels(plan, 'a').map((m) => m.id)).toEqual(['b']);
  });

  it('falls back on the catalogue order when prices are not known', () => {
    const plan = [model('a', null), model('b', 5), model('c', null), model('d', 1), model('e', 2)];
    // The chosen model has no price to measure against.
    expect(pickFallbackModels(plan, 'a').map((m) => m.id)).toEqual(['b', 'c', 'd']);
    // An unpriced candidate goes last.
    expect(pickFallbackModels(plan, 'd').map((m) => m.id)).toEqual(['e', 'b', 'a']);
  });
});
