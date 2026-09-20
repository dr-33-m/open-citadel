import { create } from 'zustand';

import {
    ensureGuestIdentity,
    forgetGuestIdentity,
    readGuestIdentity,
} from '@/services/guest-identity';

/**
 * Whether this device is somebody who paid without making an account.
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
export type GuestStatus = 'unknown' | 'none' | 'guest';

type GuestState = {
  status: GuestStatus;
  /** The RevenueCat `app_user_id` this device buys against, once it has one. */
  guestId: string | null;
  restore: () => Promise<void>;
  /**
   * Become a guest, or confirm we already are, and answer with the id to buy
   * against. Called at the moment of purchase and nowhere else.
   */
  adopt: () => Promise<string>;
  /** Stop being one, once the plan has moved onto an account. */
  release: () => Promise<void>;
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
      set(identity ? { status: 'guest', guestId: identity.guestId } : { status: 'none', guestId: null });
    } catch (error) {
      if (__DEV__) console.warn('[Guest] Could not read the device identity:', error);
      set({ status: 'none', guestId: null });
    }
  },

  adopt: async () => {
    const identity = await ensureGuestIdentity();
    set({ status: 'guest', guestId: identity.guestId });
    return identity.guestId;
  },

  release: async () => {
    await forgetGuestIdentity();
    set({ status: 'none', guestId: null });
  },
}));
