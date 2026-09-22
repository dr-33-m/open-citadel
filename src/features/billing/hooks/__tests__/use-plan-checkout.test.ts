import { beforeEach, describe, expect, it, vi } from 'vitest';

import { completeCheckout, type CheckoutIntent } from '../use-plan-checkout';

/*
 * Hoisted by vitest above the imports, which is why they are declared here
 * rather than beside the mocks that use them.
 */
const { identify, reclaimStorePurchases, refresh, showToast, adopt, account, subscription } =
  vi.hoisted(() => ({
  identify: vi.fn(async () => undefined),
  reclaimStorePurchases: vi.fn(async (_guestId: string) => false),
  refresh: vi.fn(async () => undefined),
  showToast: vi.fn(),
  adopt: vi.fn(async () => 'guest:0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55'),
  account: { status: 'signedIn' as string, sub: 'logto-sub-1' as string | null },
  subscription: { status: 'none' as string },
}));

vi.mock('@/services/purchases', () => ({ identify, reclaimStorePurchases }));
vi.mock('@/components/toast/toast-provider', () => ({ showToast }));
vi.mock('@/stores/account', () => ({
  useAccountStore: { getState: () => account },
}));
vi.mock('@/stores/guest', () => ({
  useGuestStore: { getState: () => ({ adopt }) },
}));
vi.mock('@/stores/subscription', () => ({
  useSubscriptionStore: { getState: () => ({ ...subscription, refresh }) },
}));

const BUY: CheckoutIntent = {
  kind: 'buy',
  plan: 'maester',
  packageToBuy: { identifier: 'maester_monthly' } as never,
};
const RESTORE: CheckoutIntent = { kind: 'restore' };

beforeEach(() => {
  // `clearAllMocks` forgets the calls but keeps the implementations, and one
  // of these writes to shared state, so they are put back by hand.
  vi.clearAllMocks();
  identify.mockImplementation(async () => undefined);
  reclaimStorePurchases.mockImplementation(async () => false);
  refresh.mockImplementation(async () => undefined);
  account.status = 'signedIn';
  account.sub = 'logto-sub-1';
  subscription.status = 'none';
  adopt.mockResolvedValue('guest:0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55');
});

/** Nobody signed in, which is now a reader who can still buy something. */
function signedOut() {
  account.status = 'signedOut';
  account.sub = null;
}

describe('completeCheckout', () => {
  it('joins the RevenueCat customer to the account before buying anything', async () => {
    const order: string[] = [];
    identify.mockImplementation(async () => {
      order.push('identify');
      return undefined;
    });
    const carryOut = vi.fn(async () => {
      order.push('buy');
    });

    await completeCheckout(BUY, carryOut);

    // The whole point. A purchase made before the join lands is recorded
    // against the anonymous customer and its credits are granted to nobody.
    expect(order).toEqual(['identify', 'buy']);
    expect(identify).toHaveBeenCalledWith('logto-sub-1');
  });

  it('does not buy when the store could not be told who this is', async () => {
    identify.mockRejectedValueOnce(new Error('offline'));
    const carryOut = vi.fn(async () => undefined);

    await completeCheckout(BUY, carryOut);

    expect(carryOut).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Could not reach the store') }),
    );
  });

  it('does not sell a second subscription to an account that already has one', async () => {
    refresh.mockImplementation(async () => {
      subscription.status = 'active';
    });
    const carryOut = vi.fn(async () => undefined);
    const onAlreadyActive = vi.fn();

    await completeCheckout(BUY, carryOut, onAlreadyActive);

    expect(carryOut).not.toHaveBeenCalled();
    expect(onAlreadyActive).toHaveBeenCalled();
  });

  it('restores without the plan read that would call it "already active"', async () => {
    const carryOut = vi.fn(async () => undefined);

    await completeCheckout(RESTORE, carryOut);

    expect(refresh).not.toHaveBeenCalled();
    expect(carryOut).toHaveBeenCalledWith(RESTORE);
  });

  it('does not mint a device identity for somebody who has an account', async () => {
    const carryOut = vi.fn(async () => undefined);

    await completeCheckout(BUY, carryOut);

    expect(adopt).not.toHaveBeenCalled();
    expect(identify).toHaveBeenCalledWith('logto-sub-1');
  });
});

/*
 * The App Review change. Guideline 5.1.1(v): a subscription may not require
 * registration. Nothing below asks for an account, and the assertions are
 * about what the store is told instead.
 */
describe('completeCheckout, with no account', () => {
  it('buys against a device identity minted on the spot', async () => {
    signedOut();
    const order: string[] = [];
    adopt.mockImplementation(async () => {
      order.push('adopt');
      return 'guest:0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55';
    });
    identify.mockImplementation(async () => {
      order.push('identify');
      return undefined;
    });
    const carryOut = vi.fn(async () => {
      order.push('buy');
    });

    await completeCheckout(BUY, carryOut);

    // Mint, tell the store, then sell. Any other order records the purchase
    // against an id the server can never meter.
    expect(order).toEqual(['adopt', 'identify', 'buy']);
    expect(identify).toHaveBeenCalledWith('guest:0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55');
  });

  it('restores against one too, which is how a reinstall comes back', async () => {
    signedOut();
    const carryOut = vi.fn(async () => undefined);

    await completeCheckout(RESTORE, carryOut);

    expect(adopt).toHaveBeenCalled();
    expect(carryOut).toHaveBeenCalledWith(RESTORE);
  });

  it('sells nothing when the device could not mint one', async () => {
    signedOut();
    adopt.mockRejectedValueOnce(new Error('keychain locked'));
    const carryOut = vi.fn(async () => undefined);

    await completeCheckout(BUY, carryOut);

    expect(identify).not.toHaveBeenCalled();
    expect(carryOut).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Could not start') }),
    );
  });

  it('does not sell a second subscription to a device that already has one', async () => {
    signedOut();
    refresh.mockImplementation(async () => {
      subscription.status = 'active';
    });
    const carryOut = vi.fn(async () => undefined);

    await completeCheckout(BUY, carryOut);

    expect(carryOut).not.toHaveBeenCalled();
  });
});

describe('completeCheckout, reclaiming a plan Play already holds', () => {
  it('asks Play for a guest before selling, and stops if a plan comes back', async () => {
    signedOut();
    reclaimStorePurchases.mockResolvedValue(true);
    // The first read races the transfer and misses it; the second sees it.
    refresh
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        subscription.status = 'active';
      });
    const carryOut = vi.fn(async () => undefined);
    const onAlreadyActive = vi.fn();

    await completeCheckout(BUY, carryOut, onAlreadyActive);

    expect(reclaimStorePurchases).toHaveBeenCalledWith('guest:0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(carryOut).not.toHaveBeenCalled();
    expect(onAlreadyActive).toHaveBeenCalled();
  });

  it('costs a guest who never paid no extra read', async () => {
    signedOut();
    const carryOut = vi.fn(async () => undefined);

    await completeCheckout(BUY, carryOut);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(carryOut).toHaveBeenCalled();
  });

  it('still sells when Play could not be asked', async () => {
    signedOut();
    reclaimStorePurchases.mockRejectedValue(new Error('offline'));
    const carryOut = vi.fn(async () => undefined);

    await completeCheckout(BUY, carryOut);

    expect(carryOut).toHaveBeenCalled();
  });

  it('asks Play for an account too, so a plan left on a guest is not sold twice', async () => {
    reclaimStorePurchases.mockResolvedValue(true);
    refresh
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        subscription.status = 'active';
      });
    const carryOut = vi.fn(async () => undefined);

    await completeCheckout(BUY, carryOut);

    expect(reclaimStorePurchases).toHaveBeenCalledWith('logto-sub-1');
    expect(carryOut).not.toHaveBeenCalled();
  });

  it('leaves the restore door to its own restore', async () => {
    signedOut();
    await completeCheckout(RESTORE, vi.fn(async () => undefined));

    expect(reclaimStorePurchases).not.toHaveBeenCalled();
  });
});
