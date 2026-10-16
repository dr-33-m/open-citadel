import { describe, expect, it } from 'vitest';

import { brainName, planShortName } from '@/utils/plan-name';

describe('planShortName', () => {
  it('names a plan the way a label has room for', () => {
    expect(planShortName('grand_maester')).toBe('GRAND MAESTER');
    expect(planShortName('archmaester')).toBe('ARCHMAESTER');
  });
});

describe('brainName', () => {
  it('drops a maker the label repeats', () => {
    expect(brainName({ label: 'Google: Gemini 2.5 Pro', provider: 'Google' })).toBe('Gemini 2.5 Pro');
    expect(brainName({ label: 'Claude Haiku 5.5', provider: 'Anthropic' })).toBe('Claude Haiku 5.5');
  });
});
