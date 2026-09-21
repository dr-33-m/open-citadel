import { describe, expect, it, vi } from 'vitest';

import { isAlreadyPurchased } from '../purchases';

vi.mock('@/constants/revenuecat', () => ({
  PURCHASES_ENABLED: true,
  REVENUECAT_API_KEY: 'test-key',
  REVENUECAT_OFFERING: 'default',
  REVENUECAT_TEST_STORE: false,
}));
vi.mock('@/services/purchase-lifecycle', () => ({ googleProductToReplace: vi.fn() }));
vi.mock('react-native-purchases', () => ({
  default: {},
  LOG_LEVEL: {},
  STORE_REPLACEMENT_MODE: {},
}));
vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn() },
  Platform: { OS: 'android' },
}));

describe('isAlreadyPurchased', () => {
  it('matches the code as the Android bridge sends it', () => {
    expect(isAlreadyPurchased({ code: '6', message: 'already owned' })).toBe(true);
  });

  it('matches the code as a number', () => {
    expect(isAlreadyPurchased({ code: 6 })).toBe(true);
  });

  it('matches the readable name wherever it lives', () => {
    expect(
      isAlreadyPurchased({ userInfo: { readableErrorCode: 'ProductAlreadyPurchasedError' } }),
    ).toBe(true);
    expect(isAlreadyPurchased({ readableErrorCode: 'PRODUCT_ALREADY_PURCHASED' })).toBe(true);
  });

  it('leaves other failures alone', () => {
    expect(isAlreadyPurchased({ code: '1', userCancelled: true })).toBe(false);
    expect(isAlreadyPurchased({ code: '7' })).toBe(false);
    expect(isAlreadyPurchased(new Error('network'))).toBe(false);
    expect(isAlreadyPurchased(null)).toBe(false);
  });
});
