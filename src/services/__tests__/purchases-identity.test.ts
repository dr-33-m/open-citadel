import { beforeEach, describe, expect, it, vi } from 'vitest';

import { forget, identify } from '../purchases';

/*
 * Only the two calls this file is about. Vitest hoists the factory above the
 * imports, so the handles are declared with `vi.hoisted`.
 */
const { logIn, logOut } = vi.hoisted(() => ({
  logIn: vi.fn(async () => ({ created: false })),
  logOut: vi.fn(async () => undefined),
}));

vi.mock('@/constants/revenuecat', () => ({
  PURCHASES_ENABLED: true,
  REVENUECAT_API_KEY: 'test-key',
  REVENUECAT_OFFERING: 'default',
  REVENUECAT_TEST_STORE: false,
}));
vi.mock('@/services/purchase-lifecycle', () => ({ googleProductToReplace: vi.fn() }));
vi.mock('react-native-purchases', () => ({
  default: {
    setLogHandler: vi.fn(),
    setLogLevel: vi.fn(),
    configure: vi.fn(),
    logIn,
    logOut,
  },
  LOG_LEVEL: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
  STORE_REPLACEMENT_MODE: {},
}));
vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn() },
  Platform: { OS: 'ios' },
}));

beforeEach(async () => {
  vi.clearAllMocks();
  // Each test starts with nothing remembered about who this device is.
  await forget();
  logIn.mockClear();
  logOut.mockClear();
});

describe('identify', () => {
  it('joins once, however many callers ask', async () => {
    await Promise.all([identify('sub-1'), identify('sub-1'), identify('sub-1')]);
    expect(logIn).toHaveBeenCalledTimes(1);
  });

  it('hands a later caller the join already in flight', async () => {
    let land!: () => void;
    logIn.mockReturnValueOnce(
      new Promise((resolve) => {
        land = () => resolve({ created: false });
      }),
    );

    const first = identify('sub-1');
    const second = identify('sub-1');
    // The checkout awaits this one. It must not resolve before the sign-in's
    // own call has landed, or a purchase follows it onto the wrong customer.
    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });
    await Promise.resolve();
    expect(secondSettled).toBe(false);

    land();
    await Promise.all([first, second]);
    expect(secondSettled).toBe(true);
    expect(logIn).toHaveBeenCalledTimes(1);
  });

  it('does not remember a join that failed', async () => {
    logIn.mockRejectedValueOnce(new Error('offline'));
    await expect(identify('sub-1')).rejects.toThrow('offline');

    // A cached rejection would leave every later wait resolving against an
    // identity RevenueCat never took.
    await expect(identify('sub-1')).resolves.toBeUndefined();
    expect(logIn).toHaveBeenCalledTimes(2);
  });

  it('joins again for a different account', async () => {
    await identify('sub-1');
    await identify('sub-2');
    expect(logIn).toHaveBeenNthCalledWith(1, 'sub-1');
    expect(logIn).toHaveBeenNthCalledWith(2, 'sub-2');
  });

  it('forgets the join on sign-out, so the same account joins again', async () => {
    await identify('sub-1');
    await forget();
    await identify('sub-1');
    expect(logOut).toHaveBeenCalledTimes(1);
    expect(logIn).toHaveBeenCalledTimes(2);
  });
});
