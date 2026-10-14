import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchasesPackage } from 'react-native-purchases';

import { cloudJsonHeaders } from '@/services/cloud-identity';
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
    termEndsAt: null,
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

describe('redeeming an insider code', () => {
  const REDEMPTION = { plan: 'maester', duration: 'year', endsAt: '2027-10-13T00:00:00.000Z' };
  const INSIDER_BALANCE = {
    ...ACTIVE_RESPONSE.balance,
    source: 'insider',
    termEndsAt: REDEMPTION.endsAt,
  };

  beforeEach(() => {
    useSubscriptionStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('takes the plan from the answer, then reads its brains', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json({ ok: true, balance: INSIDER_BALANCE, redemption: REDEMPTION })
        : Response.json({ ...ACTIVE_RESPONSE, balance: INSIDER_BALANCE }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await useSubscriptionStore.getState().redeemInsider('A1B2C-3D4E5-F6A7B-8C9D0');

    expect(outcome).toEqual({ ok: true, redemption: REDEMPTION });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://cloud.example.com/billing/insider/redeem',
      'https://cloud.example.com/billing/me',
    ]);
    const state = useSubscriptionStore.getState();
    expect(state.status).toBe('active');
    expect(state.plan).toBe('maester');
    expect(state.balance.source).toBe('insider');
    expect(state.balance.termEndsAt).toBe(REDEMPTION.endsAt);
  });

  it('waits out a read that left before the code was spent', async () => {
    // Asked while they had no plan, and still on its way when the code lands.
    const early = deferredResponse();
    let reads = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve(
          Response.json({ ok: true, balance: INSIDER_BALANCE, redemption: REDEMPTION }),
        );
      }
      reads += 1;
      return reads === 1
        ? early.promise
        : Promise.resolve(Response.json({ ...ACTIVE_RESPONSE, balance: INSIDER_BALANCE }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const earlyRead = useSubscriptionStore.getState().refresh();
    const redeeming = useSubscriptionStore.getState().redeemInsider('A1B2C-3D4E5-F6A7B-8C9D0');
    early.resolve(
      Response.json({ balance: { ...ACTIVE_RESPONSE.balance, plan: null, source: null }, models: [] }),
    );
    await earlyRead;
    await redeeming;

    expect(reads).toBe(2);
    const state = useSubscriptionStore.getState();
    expect(state.status).toBe('active');
    expect(state.plan).toBe('maester');
  });

  it('keeps the plan when the read after it fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Response.json({ ok: true, balance: INSIDER_BALANCE, redemption: REDEMPTION });
        }
        throw new Error('offline');
      }),
    );

    const outcome = await useSubscriptionStore.getState().redeemInsider('A1B2C-3D4E5-F6A7B-8C9D0');

    expect(outcome.ok).toBe(true);
    expect(useSubscriptionStore.getState().status).toBe('active');
    expect(useSubscriptionStore.getState().plan).toBe('maester');
  });

  it('hands back why a code was refused, and leaves the shared error alone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'already_redeemed', message: 'That code has already been used.' },
          { status: 409 },
        ),
      ),
    );

    const outcome = await useSubscriptionStore.getState().redeemInsider('A1B2C-3D4E5-F6A7B-8C9D0');

    expect(outcome).toEqual({
      ok: false,
      reason: 'already_redeemed',
      message: 'That code has already been used.',
    });
    const state = useSubscriptionStore.getState();
    expect(state.error).toBeNull();
    expect(state.busy).toBeNull();
    expect(state.status).toBe('unknown');
  });

  it('says what is wrong with the sign-in, and asks the server nothing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(cloudJsonHeaders).mockRejectedValueOnce(new Error('Your sign-in has expired.'));

    const outcome = await useSubscriptionStore.getState().redeemInsider('A1B2C-3D4E5-F6A7B-8C9D0');

    expect(outcome).toEqual({ ok: false, reason: null, message: 'Your sign-in has expired.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says the cloud could not be reached, rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    const outcome = await useSubscriptionStore.getState().redeemInsider('A1B2C-3D4E5-F6A7B-8C9D0');
    expect(outcome).toMatchObject({ ok: false, reason: null });
  });
});
