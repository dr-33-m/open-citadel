/**
 * Is Samwell set up, and is he awake?
 *
 * Both chat surfaces need the same answer and both had their own copy. They
 * had already diverged once — the hub page lost these checks entirely when it
 * took over from the per-session screen, and they were ported back by hand.
 * A second copy of a rule this fiddly is a second chance to get it wrong, so
 * it lives here.
 *
 * Selectors are per-field on purpose: the whole-store form re-renders a chat
 * screen on every token of a streaming reply, and the model store changes for
 * reasons the header does not care about.
 */
import { ACCOUNT_ENABLED } from '@/constants/logto';
import { useAccountStore } from '@/stores/account';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

/**
 * Why the cloud cannot answer.
 *
 * One value rather than a boolean each, because these are ordered — a build
 * with no server is not also "not signed in", and asking someone to sign in
 * to reach a server that does not exist is the sort of thing three separate
 * flags produce the first time one of them is read out of turn.
 */
export type CloudBlocker =
  /**
   * Everything else is in place, but Samwell is set to run on this device.
   *
   * Last in the order, because it is the only one of these a reader has
   * already chosen on purpose. Only Compass, which is cloud-only, treats it
   * as a problem; chat in offline mode is working exactly as asked, which is
   * why every chat surface tests `mode === 'cloud'` before reading this at all.
   */
  | 'offlineMode'
  /**
   * This build cannot reach the cloud at all: no server URL, or no Logto to
   * hold an account. Nothing the reader does will change either, so surfaces
   * say what is true and offer nothing.
   */
  | 'notConfigured'
  /** Configured, but nobody is signed in. Grand Maester Samwell runs on accounts. */
  | 'needsAccount'
  /**
   * Signed in, but nothing paid for.
   *
   * Ordered after `needsAccount` and before `offlineMode`, for the reason
   * that ordering already exists: a plan is bought against an account, so
   * asking somebody to subscribe before they have signed in is a dead end
   * reachable only through another dead end.
   */
  | 'needsPlan'
  /**
   * The server has not said what they hold yet.
   *
   * Its own case for exactly the reason `checkingAccount` is one, and the
   * same two answers: say nothing, because telling somebody to subscribe
   * before looking is how you flash a paywall at a paying reader on every
   * cold open; and block anyway, because a composer that is live while the
   * answer is unknown drops the message typed into it.
   */
  | 'checkingPlan'
  /**
   * The stored session has not been read back yet.
   *
   * Its own case rather than folded into either neighbour, because the two
   * questions surfaces ask have different right answers here. "What do I
   * say?" is nothing — accusing someone of being signed out before looking is
   * how you flash a sign-in prompt at somebody who is already signed in.
   * "What do I enable?" is nothing either, and that half used to be wrong:
   * treating not-yet-known as no-blocker left the Compass composer live for a
   * moment, where a message typed into it was dropped without a word.
   */
  | 'checkingAccount';

export interface SamwellReadiness {
  /** Can a message be sent right now. */
  ready: boolean;
  /** Is there a model to run at all — false is "go to Settings", not "wake up". */
  downloaded: boolean;
  loading: boolean;
  loadError: string | null;
  /** Wakes the local engine. */
  initContext: () => void;
  /** Same vocabulary as the settings store, so the two never drift. */
  mode: 'cloud' | 'offline';
  /** What stands between the reader and the cloud, or null when nothing does. */
  cloudBlocker: CloudBlocker | null;
}

export function useSamwellReadiness(): SamwellReadiness {
  const samwellMode = useSettingsStore((s) => s.samwellMode);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);
  // The status, not the account: an email or a name arriving would otherwise
  // re-render both chat surfaces for something neither of them draws.
  const accountStatus = useAccountStore((s) => s.status);
  // The status, not the balance: a credit spent mid-conversation must not
  // re-render every chat surface in the app.
  const planStatus = useSubscriptionStore((s) => s.status);

  const isLoaded = useModelStore((s) => s.isLoaded);
  const isLoading = useModelStore((s) => s.isLoading);
  const loadError = useModelStore((s) => s.loadError);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const models = useModelStore((s) => s.models);
  const modelsHydrated = useModelStore((s) => s.modelsHydrated);
  const initContext = useModelStore((s) => s.initContext);

  const isCloud = samwellMode === 'cloud';
  const activeModel = models.find((m) => m.id === activeModelId);

  /*
   * Ordered by what you would have to fix FIRST, not by what is easiest to
   * test for. That ordering is the whole value of this being one value.
   *
   * `offlineMode` used to come first, and it read the situation backwards for
   * anyone signed out: Compass told them to switch Samwell to cloud mode,
   * they did, and were met with "sign in" — two dead ends in a row, the
   * second only reachable through the first. An account is the deeper
   * prerequisite, so it is named first and the mode second.
   *
   * `ACCOUNT_ENABLED` belongs beside the missing base URL rather than with
   * the missing sign-in: a build with a server but no Logto draws no account
   * card, so calling that `needsAccount` would send the reader to a Settings
   * screen with nowhere to carry the instruction out. Both are one fact from
   * their side: this build cannot reach him.
   *
   * `checkingAccount` is the launch window and says nothing out loud, so a
   * reader who IS signed in never sees a sign-in prompt flash past on a cold
   * open. It still blocks, which is the half that matters for enabling.
   *
   * `checkingPlan` and `needsPlan` sit between the account and the mode for
   * the same reason the account sits before the mode: each one is the
   * prerequisite of the one after it. A build with no RevenueCat key reports
   * `unavailable` rather than `none`, which is deliberately NOT a blocker -
   * a build that cannot sell anything should not lock a reader out of a
   * server that may well still answer them.
   */
  const cloudBlocker: CloudBlocker | null =
    cloudBaseUrl.length === 0 || !ACCOUNT_ENABLED
      ? 'notConfigured'
      : accountStatus === 'unknown'
        ? 'checkingAccount'
        : accountStatus === 'signedOut'
          ? 'needsAccount'
          : planStatus === 'unknown'
            ? 'checkingPlan'
            : planStatus === 'none'
              ? 'needsPlan'
              : !isCloud
                ? 'offlineMode'
                : null;

  return {
    // Read off the blocker rather than rebuilt from the same parts, so the
    // two can never answer differently. They already did once: `ready` knew
    // the account was still being read while the blocker said the way was
    // clear, and every surface that trusted the second one enabled itself.
    ready: isCloud ? cloudBlocker === null : isLoaded,
    // While the model list is still hydrating we do not know whether anything
    // is downloaded, so claim nothing: the alternative is telling an install
    // that is already set up to go and set Samwell up, on every cold open.
    downloaded: isCloud ? true : modelsHydrated ? (activeModel?.isDownloaded ?? false) : true,
    loading: isLoading,
    loadError,
    initContext,
    mode: isCloud ? 'cloud' : 'offline',
    cloudBlocker,
  };
}
