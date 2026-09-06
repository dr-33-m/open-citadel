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
  /** No cloud server was configured into this build. Nothing to be done about it. */
  | 'notConfigured'
  /** Configured, but nobody is signed in. Grand Maester Samwell runs on accounts. */
  | 'needsAccount';

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
  const signedIn = accountStatus === 'signedIn';

  /*
   * Read in order, and the account comes last on purpose.
   *
   * `signedOut` rather than `!signedIn`: the moment between launch and the
   * stored session being read is `unknown`, and treating that as a blocker
   * would flash "sign in" at someone who is already signed in on every cold
   * open. During that moment nothing is claimed — `ready` is false and no
   * surface says why, which lasts about as long as a local storage read.
   */
  const cloudBlocker: CloudBlocker | null = !isCloud
    ? 'offlineMode'
    : cloudBaseUrl.length === 0
      ? 'notConfigured'
      : accountStatus === 'signedOut'
        ? 'needsAccount'
        : null;

  return {
    // Grand Maester Samwell runs on accounts now, so being signed in is as
    // much a precondition of a cloud turn as the server itself is.
    ready: isCloud ? cloudBaseUrl.length > 0 && signedIn : isLoaded,
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
