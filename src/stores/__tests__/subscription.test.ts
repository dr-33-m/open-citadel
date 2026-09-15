import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  return {
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
