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

describe('getCloudBlocker, a server that never answered', () => {
  const base = {
    configured: true,
    accountStatus: 'signedIn' as const,
    mode: 'cloud' as const,
  };

  it('reports unreachable rather than a permanent check', () => {
    // The distinction that matters: `unknown` means the beat before the first
    // answer, which surfaces hide during. `unreachable` means that beat ended
    // badly and hiding forever is the wrong response.
    expect(getCloudBlocker({ ...base, subscriptionStatus: 'unreachable' })).toBe(
      'cloudUnreachable',
    );
    expect(getCloudBlocker({ ...base, subscriptionStatus: 'unknown' })).toBe('checkingPlan');
  });

  it('still puts the account ahead of it', () => {
    expect(
      getCloudBlocker({ ...base, accountStatus: 'signedOut', subscriptionStatus: 'unreachable' }),
    ).toBe('needsAccount');
  });

  it('names offline mode after it, since neither can be acted on here', () => {
    // Offline is a setting the reader chose; an unanswering server is not.
    // The one they can do something about is the one worth naming last.
    expect(
      getCloudBlocker({ ...base, mode: 'offline', subscriptionStatus: 'unreachable' }),
    ).toBe('cloudUnreachable');
  });
});
