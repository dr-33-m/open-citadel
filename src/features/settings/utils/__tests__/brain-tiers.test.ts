import { describe, expect, it } from 'vitest';

import { brainTiers, openingTier } from '@/features/settings/utils/brain-tiers';
import type { PlanId } from 'samwell-shared';

const model = (id: string, minPlan: PlanId) => ({ id, minPlan });
const MODELS = [model('m1', 'maester'), model('m2', 'maester'), model('g1', 'grand_maester'), model('a1', 'archmaester')];

describe('brainTiers', () => {
  it('leads with the plan its own brains, then the tiers beneath, dearest first', () => {
    expect(brainTiers(MODELS, 'archmaester').map((tier) => tier.plan)).toEqual(['archmaester', 'grand_maester', 'maester']);
    expect(brainTiers(MODELS, 'archmaester')[2].models.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('lists nothing above the plan', () => {
    expect(brainTiers(MODELS, 'grand_maester').map((tier) => tier.plan)).toEqual(['grand_maester', 'maester']);
    expect(brainTiers(MODELS, 'maester').map((tier) => tier.plan)).toEqual(['maester']);
  });

  it('reads no plan as the first and drops an empty tier', () => {
    expect(brainTiers(MODELS, null).map((tier) => tier.plan)).toEqual(['maester']);
    expect(brainTiers([model('a1', 'archmaester'), model('m1', 'maester')], 'archmaester').map((tier) => tier.plan)).toEqual([
      'archmaester',
      'maester',
    ]);
  });
});

describe('openingTier', () => {
  const tiers = brainTiers(MODELS, 'archmaester');

  it('opens on the tier holding the chosen brain', () => {
    expect(openingTier(tiers, 'g1')).toBe('grand_maester');
  });

  it('falls back to the plan its own tier', () => {
    expect(openingTier(tiers, 'gone')).toBe('archmaester');
    expect(openingTier(tiers, null)).toBe('archmaester');
    expect(openingTier([], null)).toBeNull();
  });
});
