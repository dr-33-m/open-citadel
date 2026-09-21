import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchasesPackage } from 'react-native-purchases';

import { AlreadyPurchased, purchase, restore } from '@/services/purchases';
import { useSubscriptionStore } from '../subscription';

vi.mock('@/constants/revenuecat', () => ({ PURCHASES_ENABLED: true }));
vi.mock('@/constants/samwell-cloud', () => ({
  SAMWELL_CLOUD_BASE_URL: 'https://cloud.example.com',
}));
vi.mock('@/services/cloud-identity', () => ({
  cloudHeaders: vi.fn(async () => ({ Authorization: 'Bearer test' })),
  cloudJsonHeaders: vi.fn(async () => ({
    Authorization: 'Bearer test',
    'Content-Type': 'application/json',
  })),
}));
vi.mock('@/services/purchases', () => {
  class PurchaseCancelled extends Error {}
  class AlreadyPurchased extends Error {}
  return {
    AlreadyPurchased,
    PurchaseCancelled,
    getOffering: vi.fn(),
    manageSubscription: vi.fn(),
    purchase: vi.fn(),
    restore: vi.fn(),
  };
});
vi.mock('@/services/purchase-lifecycle', () => ({
  subscriptionLifecycle: vi.fn(() => null),
}));
vi.mock('@/stores/settings', () => ({
  useSettingsStore: {
    getState: () => ({ cloudModelId: null, setCloudModelId: vi.fn() }),
  },
}));

const ACTIVE_RESPONSE = {
  balance: {
    plan: 'maester',
    source: 'subscription',
    balance: 2_500,
    reserved: 0,
    available: 2_500,
    grant: 2_500,
    periodEndsAt: '2026-10-11T00:00:00.000Z',
  },
  models: [],
};

function deferredResponse(): {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
} {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('subscription refresh lifecycle', () => {
  beforeEach(() => {
    useSubscriptionStore.getState().reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('coalesces concurrent refreshes into one request', async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    const first = useSubscriptionStore.getState().refresh();
    const second = useSubscriptionStore.getState().refresh();

    expect(first).toBe(second);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    pending.resolve(Response.json(ACTIVE_RESPONSE));
    await first;
    expect(useSubscriptionStore.getState().plan).toBe('maester');
  });

  it('discards a response that completes after the account state resets', async () => {
    const pending = deferredResponse();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));

    const refresh = useSubscriptionStore.getState().refresh();
    await Promise.resolve();
    useSubscriptionStore.getState().reset();
    pending.resolve(Response.json(ACTIVE_RESPONSE));
    await refresh;

    const state = useSubscriptionStore.getState();
    expect(state.status).toBe('unknown');
    expect(state.plan).toBeNull();
    expect(state.balance.available).toBe(0);
    expect(state.loading).toBe(false);
  });
});

describe('buying a plan the reader already owns', () => {
  beforeEach(() => {
    useSubscriptionStore.getState().reset();
    vi.mocked(purchase).mockReset();
    vi.mocked(restore).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores instead of reporting a failure', async () => {
    vi.mocked(purchase).mockRejectedValue(new AlreadyPurchased());
    vi.mocked(restore).mockResolvedValue({} as never);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(ACTIVE_RESPONSE)));

    const outcome = await useSubscriptionStore
      .getState()
      .purchase({} as PurchasesPackage, 'maester');

    expect(restore).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('active');
    const state = useSubscriptionStore.getState();
    expect(state.plan).toBe('maester');
    expect(state.error).toBeNull();
    expect(state.busy).toBeNull();
  });

  it('keeps the tapped plan busy through the restore', async () => {
    vi.mocked(purchase).mockRejectedValue(new AlreadyPurchased());
    const seen: unknown[] = [];
    vi.mocked(restore).mockImplementation(async () => {
      seen.push(useSubscriptionStore.getState().busy);
      return {} as never;
    });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(ACTIVE_RESPONSE)));

    await useSubscriptionStore.getState().purchase({} as PurchasesPackage, 'maester');

    expect(seen).toEqual(['maester']);
  });

  it('reports a restore that fails, rather than throwing', async () => {
    vi.mocked(purchase).mockRejectedValue(new AlreadyPurchased());
    vi.mocked(restore).mockRejectedValue(new Error('Store unavailable.'));

    const outcome = await useSubscriptionStore
      .getState()
      .purchase({} as PurchasesPackage, 'maester');

    expect(outcome).toBe(false);
    expect(useSubscriptionStore.getState().error).toBe('Store unavailable.');
    expect(useSubscriptionStore.getState().busy).toBeNull();
  });
});
