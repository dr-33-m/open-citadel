import { create } from 'zustand';

import { ACCOUNT_ENABLED } from '@/constants/logto';
import {
    AccountCancelled,
    signOut as endSession,
    readProfile,
    signIn as startSignIn,
    type AccountEntry,
    type AccountProfile,
} from '@/services/account';
import { deleteCloudAccount } from '@/services/account-delete';
import { configurePurchases, forget, identify } from '@/services/purchases';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

/**
 * Three states, and the first one matters.
 *
 * `unknown` is the moment between launch and the stored session being read.
 * It is not "signed out": treating it as such would show someone who IS
 * signed in a "sign in to use Samwell Cloud" banner for a frame on every cold
 * open. Nothing that draws should assume anything while it is `unknown`.
 */
export type AccountStatus = 'unknown' | 'signedOut' | 'signedIn';

type AccountState = {
  status: AccountStatus;
  /** A browser is open, or a sign-out is in flight. Buttons go quiet. */
  busy: boolean;
  /** Logto's subject claim. What Samwell Cloud counts usage against. */
  sub: string | null;
  email: string | null;
  name: string | null;
  /** The last thing that went wrong, shown in the account card. */
  error: string | null;
  restore: () => Promise<void>;
  /** Drops the last failure, once it has been shown. See `useAccountErrorToast`. */
  clearError: () => void;
  signIn: (entry: AccountEntry) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Deletes the account, then ends the session.
   *
   * Resolves true only when the server said it was done. A false leaves the
   * reader signed in on purpose: the account still exists, and signing them
   * out of one they cannot then delete is the worst of both.
   */
  deleteAccount: () => Promise<boolean>;
};

const signedOut = { status: 'signedOut' as const, sub: null, email: null, name: null };

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Take the account's name as theirs, but only if they have not got one.
 *
 * Signing in is the one moment the app learns what to call somebody, and it
 * was being used only by the concierge: the onboarding screen read the name
 * and wrote it to settings itself, so anyone who took the Tinker Around door
 * and signed in from Settings afterwards had a blank display name forever.
 * That was one call site deciding something both call sites need, which is how
 * it ended up in exactly one of them.
 *
 * Never overwrites. A name they typed is theirs, and an account's `name` claim
 * is often whatever the identity provider was given at sign-up, so a later
 * sign-in must not quietly rename them.
 *
 * Only on an explicit sign-in, never on `restore`. Restore is fired and
 * forgotten at launch and can land before settings have been read, where an
 * empty `username` means "not loaded yet" rather than "not set" — and writing
 * on that reading would rename somebody on every cold start.
 */
function adoptAccountName(name: string | null) {
  const settings = useSettingsStore.getState();
  const claimed = name?.trim();
  if (!claimed || settings.username.trim()) return;
  void settings.setUsername(claimed);
}

/**
 * Tell RevenueCat which account this is.
 *
 * The one place the two identities are joined, and the join is an equality
 * rather than a mapping: RevenueCat's `app_user_id` IS the Logto subject, so
 * a webhook's `app_user_id` prefixed with `account:` is exactly the key the
 * server's credit ledger uses. There is no table in between to fall out of
 * step, which is the whole reason it is done this way.
 *
 * Fired and forgotten, and failures are swallowed to a warning on purpose.
 * Signing in must not fail because a purchases SDK could not reach the
 * network - the reader's session is real either way, the server is the thing
 * that decides what they may spend, and the next launch calls this again.
 */
function bindPurchases(sub: string) {
  void identify(sub).catch((error) => {
    if (__DEV__) console.warn('[Account] Could not identify with RevenueCat:', error);
  });
}

export const useAccountStore = create<AccountState>((set) => ({
  status: 'unknown',
  busy: false,
  sub: null,
  email: null,
  name: null,
  error: null,

  /**
   * Read the session left on this device.
   *
   * Fired and forgotten at launch. It touches the secure store and nothing on
   * the network, so it settles long before anyone can reach Settings — and if
   * it somehow has not, requests do not read this store anyway. See
   * `services/account`.
   */
  restore: async () => {
    if (!ACCOUNT_ENABLED) {
      set(signedOut);
      return;
    }
    let profile: AccountProfile | null = null;
    try {
      profile = await readProfile();
      set(profile ? { status: 'signedIn', ...profile, error: null } : signedOut);
    } catch (error) {
      if (__DEV__) console.warn('[Account] Could not restore the session:', error);
      set(signedOut);
    }

    /*
     * Outside the try, and that is the fix rather than tidying.
     *
     * This used to sit on the success path, so anything thrown while reading
     * the session left the purchases SDK unconfigured for the life of the
     * process - and the failure did not look like an account problem at all.
     * The plan carousel could not price a single card, every CustomerInfo
     * read came back "this build cannot take payments", and the reader was
     * shown a build that appeared to have no plans in it.
     *
     * Configured with the account in hand rather than anonymously, so
     * RevenueCat never mints a throwaway customer that a purchase could land
     * on before the alias catches up. See `services/purchases`.
     */
    configurePurchases(profile?.sub ?? null);
    if (profile) bindPurchases(profile.sub);
  },

  signIn: async (entry) => {
    set({ busy: true, error: null });
    try {
      const profile = await startSignIn(entry);
      set(profile ? { status: 'signedIn', ...profile } : signedOut);
      if (profile) {
        adoptAccountName(profile.name);
        bindPurchases(profile.sub);
      }
    } catch (error) {
      // Closing the browser is a decision, not a failure, and saying "sign-in
      // failed" over it would be telling someone their own choice went wrong.
      if (error instanceof AccountCancelled) return;
      set({ error: message(error, 'Could not sign you in. Try again.') });
    } finally {
      set({ busy: false });
    }
  },

  clearError: () => set({ error: null }),

  deleteAccount: async () => {
    set({ busy: true, error: null });
    try {
      await deleteCloudAccount();
    } catch (error) {
      set({
        busy: false,
        error: message(error, 'Your account could not be deleted. Try again.'),
      });
      return false;
    }

    /*
     * The account is gone, so the session is worthless and the local sign-out
     * must not be allowed to fail visibly. Logto revokes tokens for a user it
     * no longer has, which is a 4xx the SDK reports as an error; swallowing it
     * here is right, because the one thing the reader asked for has already
     * happened.
     */
    try {
      await endSession();
    } catch (error) {
      if (__DEV__) console.warn('[Account] Session cleanup after delete:', error);
    }
    set({ ...signedOut, busy: false, error: null });
    useSubscriptionStore.getState().reset();
    void forget().catch((error) => {
      if (__DEV__) console.warn('[Account] Could not sign out of RevenueCat:', error);
    });
    return true;
  },

  signOut: async () => {
    set({ busy: true, error: null });
    try {
      await endSession();
      set(signedOut);
      useSubscriptionStore.getState().reset();
      /*
       * RevenueCat moves to a fresh anonymous customer, so the next person to
       * sign in on this device does not inherit the last one's plan. Not
       * awaited with the sign-out itself: the session is already gone, and a
       * purchases SDK that cannot be reached must not leave somebody looking
       * signed in.
       */
      void forget().catch((error) => {
        if (__DEV__) console.warn('[Account] Could not sign out of RevenueCat:', error);
      });
    } catch (error) {
      set({ error: message(error, 'Could not sign you out. Try again.') });
    } finally {
      set({ busy: false });
    }
  },
}));

/**
 * Whether Samwell Cloud has an account to bill, without subscribing to the
 * profile that changes around it.
 *
 * The readiness hook and the cloud panel both need this one boolean, and the
 * whole-store form would re-render them every time a name or an error moved.
 */
export function useSignedIn(): boolean {
  return useAccountStore((s) => s.status === 'signedIn');
}
