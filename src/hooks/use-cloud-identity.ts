import React from 'react';

import { useAccountStore } from '@/stores/account';
import { useGuestStore } from '@/stores/guest';

/**
 * Who this device is to Samwell Cloud, in one value.
 *
 * There are two identities now - an account, and a device that bought a plan
 * without one - and four places had to know which. The plan sync, the cloud
 * blocker, the Cloud panel and the checkout each used to ask "is there an
 * account", which is a question that stopped being the right one the moment a
 * guest could pay. Four copies of that decision is how this codebase has
 * drifted before, so there is one.
 *
 * An account wins when there is one. The same order `cloudHeaders` uses, and
 * for the same reason: a device that has since signed in must be billed as
 * the person, not as the phone.
 */
export type CloudIdentity = {
  kind: 'unknown' | 'none' | 'account' | 'guest';
  /** What the server meters against, or null while there is nobody. */
  id: string | null;
};

export function useCloudIdentity(): CloudIdentity {
  const accountStatus = useAccountStore((s) => s.status);
  const sub = useAccountStore((s) => s.sub);
  const guestStatus = useGuestStore((s) => s.status);
  const guestId = useGuestStore((s) => s.guestId);

  return React.useMemo(
    () => cloudIdentity(accountStatus, sub, guestStatus, guestId),
    [accountStatus, sub, guestStatus, guestId],
  );
}

/**
 * The same answer without a renderer, for stores and effects.
 *
 * `unknown` only while BOTH are still being read. An account that has landed
 * settles the question on its own, so a signed-in reader never waits on a
 * Keychain read they have no use for.
 */
export function cloudIdentity(
  accountStatus: ReturnType<typeof useAccountStore.getState>['status'],
  sub: string | null,
  guestStatus: ReturnType<typeof useGuestStore.getState>['status'],
  guestId: string | null,
): CloudIdentity {
  if (accountStatus === 'signedIn' && sub) return { kind: 'account', id: sub };
  if (accountStatus === 'unknown') return { kind: 'unknown', id: null };
  if (guestStatus === 'guest' && guestId) return { kind: 'guest', id: guestId };
  if (guestStatus === 'unknown') return { kind: 'unknown', id: null };
  return { kind: 'none', id: null };
}

/** The same answer from outside React, for effects that must not re-render. */
export function readCloudIdentity(): CloudIdentity {
  const account = useAccountStore.getState();
  const guest = useGuestStore.getState();
  return cloudIdentity(account.status, account.sub, guest.status, guest.guestId);
}
