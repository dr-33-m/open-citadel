import React from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import * as Inference from '@/services/inference';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';

/**
 * Gate an action behind Samwell being awake.
 *
 * On-device work needs the engine loaded, which can take a while and is not
 * something to do behind the reader's back mid-task. Rather than failing with
 * "load a model in Settings" after the fact, the caller asks first and the
 * reader decides: wake him now and carry on, or cancel. Cloud needs no engine,
 * so it passes straight through.
 *
 * Usage:
 *   const { ensureAwake, wakeDialog } = useSamwellWake();
 *   if (!(await ensureAwake())) return;   // reader cancelled, or waking failed
 *   ...
 *   {wakeDialog}
 */
export function useSamwellWake() {
  // Held while the dialog is up: resolving it is what unblocks the caller.
  const pending = React.useRef<((ok: boolean) => void) | null>(null);
  const [asking, setAsking] = React.useState(false);
  const [waking, setWaking] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  const ensureAwake = React.useCallback(async (): Promise<boolean> => {
    if (useSettingsStore.getState().samwellMode === 'cloud') return true;
    if (Inference.isModelLoaded()) return true;

    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setFailed(null);
      setAsking(true);
    });
  }, []);

  const settle = React.useCallback((ok: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setAsking(false);
    setWaking(false);
    resolve?.(ok);
  }, []);

  const handleWake = React.useCallback(async () => {
    setWaking(true);
    try {
      await useModelStore.getState().initContext();
    } catch {
      // The store records the reason; all that matters here is whether the
      // engine came up.
    }
    if (Inference.isModelLoaded()) {
      settle(true);
      return;
    }
    // Stay open and say so, rather than dismissing into a silent no-op.
    setWaking(false);
    setFailed(useModelStore.getState().loadError ?? 'Samwell could not wake up.');
  }, [settle]);

  const wakeDialog = (
    <ConfirmDialog
      visible={asking}
      busy={waking}
      title={failed ? 'Could not wake Samwell' : waking ? 'Waking Samwell up…' : 'Wake Samwell up?'}
      message={
        failed ??
        (waking
          ? 'Waking him up. This takes a moment on device.'
          : 'He needs to be awake to suggest tags. This runs on your device and takes a moment.')
      }
      onClose={() => settle(false)}
      actions={[
        { label: 'CANCEL', onPress: () => settle(false) },
        { label: failed ? 'TRY AGAIN' : 'WAKE UP', onPress: handleWake, confirm: true },
      ]}
    />
  );

  return { ensureAwake, wakeDialog };
}
