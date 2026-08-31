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
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';

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
  /** Cloud has no base URL configured in this build. */
  cloudUnavailable: boolean;
}

export function useSamwellReadiness(): SamwellReadiness {
  const samwellMode = useSettingsStore((s) => s.samwellMode);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);

  const isLoaded = useModelStore((s) => s.isLoaded);
  const isLoading = useModelStore((s) => s.isLoading);
  const loadError = useModelStore((s) => s.loadError);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const models = useModelStore((s) => s.models);
  const modelsHydrated = useModelStore((s) => s.modelsHydrated);
  const initContext = useModelStore((s) => s.initContext);

  const isCloud = samwellMode === 'cloud';
  const activeModel = models.find((m) => m.id === activeModelId);

  return {
    ready: isCloud ? cloudBaseUrl.length > 0 : isLoaded,
    // While the model list is still hydrating we do not know whether anything
    // is downloaded, so claim nothing: the alternative is telling an install
    // that is already set up to go and set Samwell up, on every cold open.
    downloaded: isCloud ? true : modelsHydrated ? (activeModel?.isDownloaded ?? false) : true,
    loading: isLoading,
    loadError,
    initContext,
    mode: isCloud ? 'cloud' : 'offline',
    cloudUnavailable: isCloud && cloudBaseUrl.length === 0,
  };
}
