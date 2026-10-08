import { describe, expect, it } from 'vitest';

import { cloudFailureCopy } from '@/features/tts/utils/cloud-failure';
import type { CloudVoiceFailure } from '@/services/cloud-tts/request';

const FAILURES: CloudVoiceFailure[] = ['out_of_credits', 'offline', 'plan_lapsed', 'maker_failed'];
const SELLING = { canSell: true, canUpgrade: true };

describe('cloudFailureCopy', () => {
  it('always offers a way to carry on with the phone', () => {
    for (const failure of FAILURES) {
      const copy = cloudFailureCopy(failure, { canSell: false, canUpgrade: false });
      expect([copy.primary.action, copy.secondary?.action]).toContain('continue');
    }
  });

  it('says each state in its own words, with no em dashes', () => {
    const titles = FAILURES.map((failure) => cloudFailureCopy(failure, SELLING).title);
    expect(new Set(titles).size).toBe(FAILURES.length);
    for (const failure of FAILURES) {
      const copy = cloudFailureCopy(failure, SELLING);
      expect(`${copy.title} ${copy.line}`).not.toContain('—');
    }
  });

  it('offers an upgrade only where there is one to sell', () => {
    expect(cloudFailureCopy('out_of_credits', SELLING).secondary).toEqual({ label: 'UPGRADE', action: 'plans' });
    expect(cloudFailureCopy('out_of_credits', { canSell: true, canUpgrade: false }).secondary).toBeNull();
    expect(cloudFailureCopy('plan_lapsed', { canSell: false, canUpgrade: true }).secondary).toBeNull();
  });

  it('tries a failing maker again first, and a missing connection second', () => {
    expect(cloudFailureCopy('maker_failed', SELLING).primary.action).toBe('retry');
    expect(cloudFailureCopy('offline', SELLING).secondary?.action).toBe('retry');
  });
});
