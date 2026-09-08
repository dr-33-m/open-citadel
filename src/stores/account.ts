import { create } from 'zustand';

import {
  AccountCancelled,
  readProfile,
  signIn as startSignIn,
  signOut as endSession,
  type AccountEntry,
} from '@/services/account';
import { ACCOUNT_ENABLED } from '@/constants/logto';
import { useSettingsStore } from '@/stores/settings';

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
  signIn: (entry: AccountEntry) => Promise<void>;
  signOut: () => Promise<void>;
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
    try {
      const profile = await readProfile();
      set(profile ? { status: 'signedIn', ...profile, error: null } : signedOut);
    } catch (error) {
      if (__DEV__) console.warn('[Account] Could not restore the session:', error);
      set(signedOut);
    }
  },

  signIn: async (entry) => {
    set({ busy: true, error: null });
    try {
      const profile = await startSignIn(entry);
      set(profile ? { status: 'signedIn', ...profile } : signedOut);
      if (profile) adoptAccountName(profile.name);
    } catch (error) {
      // Closing the browser is a decision, not a failure, and saying "sign-in
      // failed" over it would be telling someone their own choice went wrong.
      if (error instanceof AccountCancelled) return;
      set({ error: message(error, 'Could not sign you in. Try again.') });
    } finally {
      set({ busy: false });
    }
  },

  signOut: async () => {
    set({ busy: true, error: null });
    try {
      await endSession();
      set(signedOut);
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
