import { beforeEach, describe, expect, it, vi } from 'vitest';

const { platform, testStore, restorePurchases } = vi.hoisted(() => ({
  platform: { OS: 'android' },
  testStore: { value: false },
  restorePurchases: vi.fn(async () => ({ entitlements: { active: {} } })),
}));

vi.mock('@/constants/revenuecat', () => ({
  PURCHASES_ENABLED: true,
  REVENUECAT_API_KEY: 'test-key',
  REVENUECAT_OFFERING: 'default',
  get REVENUECAT_TEST_STORE() {
    return testStore.value;
  },
}));
vi.mock('@/services/purchase-lifecycle', () => ({ googleProductToReplace: vi.fn() }));
vi.mock('react-native-purchases', () => ({
  default: {
    setLogHandler: vi.fn(),
    setLogLevel: vi.fn(),
    configure: vi.fn(),
    restorePurchases,
    ENTITLEMENT_VERIFICATION_MODE: { INFORMATIONAL: 'INFORMATIONAL' },
  },
  LOG_LEVEL: {},
  STORE_REPLACEMENT_MODE: {},
}));
vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn() },
  Platform: platform,
}));

/*
 * Fresh module per test: the once-per-guest memory is module state, and
 * leaking it between tests would make the order matter.
 */
async function load() {
  vi.resetModules();
  const purchases = await import('../purchases');
  purchases.configurePurchases(null);
  return purchases;
}

beforeEach(() => {
  restorePurchases.mockClear();
  restorePurchases.mockImplementation(async () => ({ entitlements: { active: {} } }));
  platform.OS = 'android';
  testStore.value = false;
});

describe('reclaimStorePurchases', () => {
  it('reports a plan Play hands back', async () => {
    const { reclaimStorePurchases } = await load();
    restorePurchases.mockResolvedValue({ entitlements: { active: { maester: {} } } });

    expect(await reclaimStorePurchases('guest:a')).toBe(true);
  });

  it('asks Play once per guest per session', async () => {
    const { reclaimStorePurchases } = await load();

    expect(await reclaimStorePurchases('guest:a')).toBe(false);
    expect(await reclaimStorePurchases('guest:a')).toBe(false);
    expect(restorePurchases).toHaveBeenCalledTimes(1);

    await reclaimStorePurchases('guest:b');
    expect(restorePurchases).toHaveBeenCalledTimes(2);
  });

  it('asks again after a failure, since nothing was learned', async () => {
    const { reclaimStorePurchases } = await load();
    restorePurchases.mockRejectedValueOnce(new Error('offline'));

    await expect(reclaimStorePurchases('guest:a')).rejects.toThrow('offline');
    await reclaimStorePurchases('guest:a');
    expect(restorePurchases).toHaveBeenCalledTimes(2);
  });

  it('does nothing on iOS or against the Test Store', async () => {
    const { reclaimStorePurchases } = await load();
    platform.OS = 'ios';
    expect(await reclaimStorePurchases('guest:a')).toBe(false);
    platform.OS = 'android';
    testStore.value = true;
    expect(await reclaimStorePurchases('guest:a')).toBe(false);
    expect(restorePurchases).not.toHaveBeenCalled();
  });
});
