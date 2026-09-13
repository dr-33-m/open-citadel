import { describe, expect, it } from 'vitest';

import { getCloudBlocker } from '../cloud-access';

describe('getCloudBlocker', () => {
  const configured = true;

  it('checks configuration and account before subscription', () => {
    expect(
      getCloudBlocker({
        configured: false,
        accountStatus: 'unknown',
        subscriptionStatus: 'unknown',
        mode: 'offline',
      }),
    ).toBe('notConfigured');

    expect(
      getCloudBlocker({
        configured,
        accountStatus: 'unknown',
        subscriptionStatus: 'active',
        mode: 'offline',
      }),
    ).toBe('checkingAccount');

    expect(
      getCloudBlocker({
        configured,
        accountStatus: 'signedOut',
        subscriptionStatus: 'active',
        mode: 'offline',
      }),
    ).toBe('needsAccount');
  });

  it('waits for subscription state and directs readers without a plan', () => {
    expect(
      getCloudBlocker({
        configured,
        accountStatus: 'signedIn',
        subscriptionStatus: 'unknown',
        mode: 'offline',
      }),
    ).toBe('checkingPlan');

    expect(
      getCloudBlocker({
        configured,
        accountStatus: 'signedIn',
        subscriptionStatus: 'none',
        mode: 'offline',
      }),
    ).toBe('needsPlan');
  });

  it('allows switching only after the prerequisites are satisfied', () => {
    expect(
      getCloudBlocker({
        configured,
        accountStatus: 'signedIn',
        subscriptionStatus: 'active',
        mode: 'offline',
      }),
    ).toBe('offlineMode');

    expect(
      getCloudBlocker({
        configured,
        accountStatus: 'signedIn',
        subscriptionStatus: 'active',
        mode: 'cloud',
      }),
    ).toBeNull();
  });
});
