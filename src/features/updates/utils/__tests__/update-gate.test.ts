import { describe, expect, it } from 'vitest';

import { gateCopy, readVerdict, storeLinks } from '../update-gate';

describe('readVerdict', () => {
  it('reads the two verdicts the server sends', () => {
    expect(readVerdict({ update: 'store' })).toBe('store');
    expect(readVerdict({ error: 'update_required', update: 'restart' })).toBe('restart');
  });

  it('reads anything else as no verdict', () => {
    expect(readVerdict({ update: null })).toBeNull();
    expect(readVerdict({ update: 'later' })).toBeNull();
    expect(readVerdict(null)).toBeNull();
    expect(readVerdict('store')).toBeNull();
  });
});

describe('gateCopy', () => {
  it('says each verdict plainly, with no em dashes', () => {
    for (const verdict of ['store', 'restart'] as const) {
      const copy = gateCopy(verdict);
      expect(Object.values(copy).join(' ')).not.toContain('—');
      expect(copy.action).toBe(copy.action.toUpperCase());
    }
  });
});

describe('storeLinks', () => {
  it('opens Google Play for the package on Android', () => {
    expect(storeLinks('android', 'com.dr33m.opencitadel', '1')).toEqual({
      app: 'market://details?id=com.dr33m.opencitadel',
      web: 'https://play.google.com/store/apps/details?id=com.dr33m.opencitadel',
    });
  });

  it('opens the App Store for the app on iOS', () => {
    expect(storeLinks('ios', 'unused', '6789093612').app).toBe('itms-apps://apps.apple.com/app/id6789093612');
  });
});
