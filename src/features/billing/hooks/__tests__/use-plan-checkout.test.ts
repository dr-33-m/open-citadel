import { beforeEach, describe, expect, it, vi } from 'vitest';

import { completeCheckout, type CheckoutIntent } from '../use-plan-checkout';

/*
 * Hoisted by vitest above the imports, which is why they are declared here
 * rather than beside the mocks that use them.
 */
const { identify, refresh, showToast, account, subscription } = vi.hoisted(() => ({
  identify: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
  showToast: vi.fn(),
  account: { sub: 'logto-sub-1' as string | null },
  subscription: { status: 'none' as string },
}));

vi.mock('@/services/purchases', () => ({ identify }));
vi.mock('@/components/toast/toast-provider', () => ({ showToast }));
vi.mock('@/stores/account', () => ({
  useAccountStore: { getState: () => account },
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
  vi.clearAllMocks();
  account.sub = 'logto-sub-1';
  subscription.status = 'none';
});

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

  it('does nothing at all when the sign-in carried no account', async () => {
    account.sub = null;
    const carryOut = vi.fn(async () => undefined);

    await completeCheckout(BUY, carryOut);

    expect(identify).not.toHaveBeenCalled();
    expect(carryOut).not.toHaveBeenCalled();
  });
});
