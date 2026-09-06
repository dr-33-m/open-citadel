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

/**
 * Why the cloud cannot answer.
 *
 * One value rather than a boolean each, because these are ordered — a build
 * with no server is not also "not signed in", and asking someone to sign in
 * to reach a server that does not exist is the sort of thing three separate
 * flags produce the first time one of them is read out of turn.
 */
export type CloudBlocker =
  /** Samwell is set to run on this device. Only Compass, which is cloud-only, cares. */
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
   * Read in order, and the account comes last on purpose.
   *
   * `checkingAccount` is the launch window and says nothing out loud, so a
   * reader who IS signed in never sees a sign-in prompt flash past on a cold
   * open. It still blocks, which is the half that matters for anything
   * enabling a control.
   */
  const cloudBlocker: CloudBlocker | null = !isCloud
    ? 'offlineMode'
    : // `ACCOUNT_ENABLED` belongs beside the base URL, not after it. A build
      // with a server but no Logto has no way to make an account, so calling
      // that `needsAccount` sent the reader to a Settings screen that draws no
      // account card — an instruction with nowhere to carry it out. Both are
      // the same fact from the reader's side: this build cannot reach him.
      cloudBaseUrl.length === 0 || !ACCOUNT_ENABLED
      ? 'notConfigured'
      : accountStatus === 'unknown'
        ? 'checkingAccount'
        : accountStatus === 'signedOut'
          ? 'needsAccount'
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
