import { create } from 'zustand';

import {
    ensureGuestIdentity,
    forgetGuestLink,
    GuestLinked,
    onGuestRetired,
    readGuestIdentity,
    readLinkedGuest,
    retireGuestIdentity,
} from '@/services/guest-identity';

/**
 * Whether this device is somebody who paid without making an account, or
 * was, until that guest joined an account (`linked`: it never becomes one
 * again, and a signed-out reader is sent to sign in instead).
 *
 * A thin store over `services/guest-identity`, and it exists for one reason:
 * the answer lives in the Keychain, which is a promise, and three things that
 * draw need it synchronously. Reading it per render would be an await on the
 * render path; reading it here once at launch is a value they can subscribe
 * to.
 *
 * The service stays the authority. Nothing here decides anything - it
 * remembers what the service said so the UI can ask without waiting.
 */
export type GuestStatus = 'unknown' | 'none' | 'guest' | 'linked';

type GuestState = {
  status: GuestStatus;
  /** The RevenueCat `app_user_id` this device buys against, once it has one. */
  guestId: string | null;
  restore: () => Promise<void>;
  /**
   * Become a guest, or confirm we already are, and answer with the id to buy
   * against. Called at the moment of purchase and nowhere else. Throws
   * `GuestLinked` on a device whose guest has joined an account.
   */
  adopt: () => Promise<string>;
  /** Stop being one for good, once the guest has joined an account. */
  retire: () => Promise<void>;
  /** Testing only: forget a link so this device may buy as a guest again. */
  forgetLink: () => Promise<boolean>;
};

export const useGuestStore = create<GuestState>((set) => ({
  status: 'unknown',
  guestId: null,

  /**
   * Fired and forgotten at launch, beside the account's own restore.
   *
   * `unknown` until it lands, which is the same care the account store takes:
   * a device that DID buy a plan must not be told to choose one for a frame
   * on every cold open.
   */
  restore: async () => {
    try {
      const identity = await readGuestIdentity();
      if (identity) {
        set({ status: 'guest', guestId: identity.guestId });
        return;
      }
      set({ status: (await readLinkedGuest()) ? 'linked' : 'none', guestId: null });
    } catch (error) {
      if (__DEV__) console.warn('[Guest] Could not read the device identity:', error);
      set({ status: 'none', guestId: null });
    }
  },

  adopt: async () => {
    try {
      const identity = await ensureGuestIdentity();
      set({ status: 'guest', guestId: identity.guestId });
      return identity.guestId;
    } catch (error) {
      if (error instanceof GuestLinked) set({ status: 'linked', guestId: null });
      throw error;
    }
  },

  // The status follows from the listener below, whoever retired the guest.
  retire: () => retireGuestIdentity(),

  forgetLink: async () => {
    const forgot = await forgetGuestLink();
    if (forgot) set({ status: 'none', guestId: null });
    return forgot;
  },
}));

/*
 * Module scope, once: the store lives for the whole app, so there is nothing
 * to unsubscribe from. Covers the retirement the store did not start - the
 * server refusing a token for a guest that has already joined an account -
 * which would otherwise leave a signed-out device drawn as a guest until the
 * next launch.
 */
onGuestRetired(() => useGuestStore.setState({ status: 'linked', guestId: null }));
