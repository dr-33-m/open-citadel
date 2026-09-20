import { describe, expect, it } from 'vitest';

import { getCloudBlocker } from '../cloud-access';

describe('getCloudBlocker', () => {
  const configured = true;
  const purchasable = true;

  it('checks configuration and identity before subscription', () => {
    expect(
      getCloudBlocker({
        configured: false,
        identity: 'unknown',
        purchasable,
        subscriptionStatus: 'unknown',
        mode: 'offline',
      }),
    ).toBe('notConfigured');

    expect(
      getCloudBlocker({
        configured,
        identity: 'unknown',
        purchasable,
        subscriptionStatus: 'active',
        mode: 'offline',
      }),
    ).toBe('checkingAccount');

    expect(
      getCloudBlocker({
        configured,
        identity: 'none',
        purchasable,
        subscriptionStatus: 'active',
        mode: 'offline',
      }),
    ).toBe('needsPlan');
  });

  it('asks a reader with nobody to be for a plan, not an account', () => {
    // The rejection this answers: paying may not require registering. The way
    // through for somebody with no account is now the plans, and the account
    // is what the sheet afterwards offers rather than what the door demands.
    expect(
      getCloudBlocker({
        configured,
        identity: 'none',
        purchasable,
        subscriptionStatus: 'unknown',
        mode: 'cloud',
      }),
    ).toBe('needsPlan');
  });

  it('asks for an account only where there is nothing to sell', () => {
    // A build with no RevenueCat key can draw the plans but cannot take the
    // money, so "choose a plan" would be a door onto a wall.
    expect(
      getCloudBlocker({
        configured,
        identity: 'none',
        purchasable: false,
        subscriptionStatus: 'unknown',
        mode: 'cloud',
      }),
    ).toBe('needsAccount');
  });

  it('treats a device that bought a plan exactly like an account', () => {
    expect(
      getCloudBlocker({
        configured,
        identity: 'guest',
        purchasable,
        subscriptionStatus: 'active',
        mode: 'cloud',
      }),
    ).toBeNull();

    expect(
      getCloudBlocker({
        configured,
        identity: 'guest',
        purchasable,
        subscriptionStatus: 'none',
        mode: 'cloud',
      }),
    ).toBe('needsPlan');
  });

  it('waits for subscription state and directs readers without a plan', () => {
    expect(
      getCloudBlocker({
        configured,
        identity: 'account',
        purchasable,
        subscriptionStatus: 'unknown',
        mode: 'offline',
      }),
    ).toBe('checkingPlan');

    expect(
      getCloudBlocker({
        configured,
        identity: 'account',
        purchasable,
        subscriptionStatus: 'none',
        mode: 'offline',
      }),
    ).toBe('needsPlan');
  });

  it('allows switching only after the prerequisites are satisfied', () => {
    expect(
      getCloudBlocker({
        configured,
        identity: 'account',
        purchasable,
        subscriptionStatus: 'active',
        mode: 'offline',
      }),
    ).toBe('offlineMode');

    expect(
      getCloudBlocker({
        configured,
        identity: 'account',
        purchasable,
        subscriptionStatus: 'active',
        mode: 'cloud',
      }),
    ).toBeNull();
  });
});

describe('getCloudBlocker, a server that never answered', () => {
  const base = {
    configured: true,
    identity: 'account' as const,
    purchasable: true,
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

  it('still puts the identity ahead of it', () => {
    // Nobody to ask on behalf of, so there was never a request to fail.
    expect(
      getCloudBlocker({ ...base, identity: 'none', subscriptionStatus: 'unreachable' }),
    ).toBe('needsPlan');
  });

  it('names offline mode after it, since neither can be acted on here', () => {
    // Offline is a setting the reader chose; an unanswering server is not.
    // The one they can do something about is the one worth naming last.
    expect(
      getCloudBlocker({ ...base, mode: 'offline', subscriptionStatus: 'unreachable' }),
    ).toBe('cloudUnreachable');
  });
});
