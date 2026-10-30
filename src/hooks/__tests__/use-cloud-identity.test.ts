import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasCloudIdentity, readCloudIdentity } from '@/hooks/use-cloud-identity';

const account = vi.hoisted(() => ({ status: 'signedOut', sub: null as string | null }));
const guest = vi.hoisted(() => ({ status: 'none', guestId: null as string | null }));

vi.mock('@/stores/account', () => ({ useAccountStore: { getState: () => account, subscribe: () => () => undefined } }));
vi.mock('@/stores/guest', () => ({ useGuestStore: { getState: () => guest, subscribe: () => () => undefined } }));

describe('hasCloudIdentity', () => {
  beforeEach(() => {
    Object.assign(account, { status: 'signedOut', sub: null });
    Object.assign(guest, { status: 'none', guestId: null });
  });

  it('is true for a guest who bought a plan, with no account', () => {
    Object.assign(guest, { status: 'guest', guestId: 'guest:1' });
    expect(readCloudIdentity().kind).toBe('guest');
    expect(hasCloudIdentity()).toBe(true);
  });

  it('is true for an account, which wins over a guest', () => {
    Object.assign(account, { status: 'signedIn', sub: 'a1' });
    Object.assign(guest, { status: 'guest', guestId: 'guest:1' });
    expect(readCloudIdentity().kind).toBe('account');
    expect(hasCloudIdentity()).toBe(true);
  });

  it('is false for nobody, and while the stores are still being read', () => {
    expect(hasCloudIdentity()).toBe(false);
    Object.assign(account, { status: 'unknown' });
    expect(hasCloudIdentity()).toBe(false);
  });

  it('is false for a linked device signed out: its plan is on the account', () => {
    Object.assign(guest, { status: 'linked' });
    expect(hasCloudIdentity()).toBe(false);
  });
});
