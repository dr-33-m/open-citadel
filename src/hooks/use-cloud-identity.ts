import React from 'react';

import { useAccountStore, type AccountStatus } from '@/stores/account';
import { useGuestStore, type GuestStatus } from '@/stores/guest';

/**
 * Who this device is to Samwell Cloud, in one value.
 *
 * There are two identities now - an account, and a device that bought a plan
 * without one - and five places had to know which. The plan sync, the cloud
 * blocker, the billing lifecycle, the Cloud panel and the checkout each used
 * to ask "is there an account", which is a question that stopped being the
 * right one the moment a guest could pay. Five copies of that decision is how
 * this codebase has drifted before, so there is one.
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

/**
 * The decision itself, with no React in it.
 *
 * `unknown` only while the store that would decide is still being read. An
 * account that has landed settles the question on its own, so a signed-in
 * reader never waits on a Keychain read they have no use for.
 */
function resolve(
  accountStatus: AccountStatus,
  sub: string | null,
  guestStatus: GuestStatus,
  guestId: string | null,
): CloudIdentity {
  if (accountStatus === 'signedIn' && sub) return { kind: 'account', id: sub };
  /*
   * Load-bearing, and not only for correctness: an unread account store is
   * reported as `unknown` here no matter what the guest store says, and the
   * Cloud panel leans on that. Restoring the account is what configures the
   * purchases SDK, so the panel waits for this to leave `unknown` before it
   * asks the store for its offering. Let the guest answer first and that call
   * throws instead.
   */
  if (accountStatus === 'unknown') return { kind: 'unknown', id: null };
  // A `linked` device is nobody while signed out: its plan is on the account.
  if (guestStatus === 'guest' && guestId) return { kind: 'guest', id: guestId };
  if (guestStatus === 'unknown') return { kind: 'unknown', id: null };
  return { kind: 'none', id: null };
}

/**
 * The last answer, kept so the object only changes when the answer does.
 *
 * This is the whole reason the hooks below are `useSyncExternalStore` rather
 * than four zustand selectors. The two stores settle independently at launch,
 * and for a signed-in reader the guest store settling moves nothing: the
 * account had already decided it. Four selectors would re-render both chat
 * surfaces, the status bar and the root for that non-event, on every cold
 * open. React compares this snapshot with `Object.is` and stays put.
 */
let snapshot: CloudIdentity = { kind: 'unknown', id: null };

/** The answer from outside React, for stores and effects. */
export function readCloudIdentity(): CloudIdentity {
  const account = useAccountStore.getState();
  const guest = useGuestStore.getState();
  const next = resolve(account.status, account.sub, guest.status, guest.guestId);
  if (next.kind !== snapshot.kind || next.id !== snapshot.id) snapshot = next;
  return snapshot;
}

function subscribe(onChange: () => void): () => void {
  const account = useAccountStore.subscribe(onChange);
  const guest = useGuestStore.subscribe(onChange);
  return () => {
    account();
    guest();
  };
}

export function useCloudIdentity(): CloudIdentity {
  return React.useSyncExternalStore(subscribe, readCloudIdentity);
}

/**
 * Only the id, for callers that do not draw.
 *
 * `usePlanSync` runs at the root and wants one thing: has the thing we meter
 * against changed. Taking the whole identity there would re-render the
 * navigation tree when a device with no account finishes reading its
 * Keychain and finds nothing, which moves no id at all.
 */
export function useCloudIdentityId(): string | null {
  return React.useSyncExternalStore(subscribe, readCloudIdentityId);
}

function readCloudIdentityId(): string | null {
  return readCloudIdentity().id;
}
