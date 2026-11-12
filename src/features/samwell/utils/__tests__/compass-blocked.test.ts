import { describe, expect, it } from 'vitest';

import { compassBlockedDetail } from '../compass-blocked';

describe('compassBlockedDetail', () => {
  it('says why goals are out of reach', () => {
    expect(compassBlockedDetail('needsPlan')).toBe('Needs a plan');
    expect(compassBlockedDetail('offlineMode')).toBe('Needs Samwell Cloud');
    expect(compassBlockedDetail('noConnection')).toBe('You are offline');
  });

  it('says nothing while it is still looking', () => {
    expect(compassBlockedDetail('checkingAccount')).toBeNull();
    expect(compassBlockedDetail('checkingPlan')).toBeNull();
  });
});
