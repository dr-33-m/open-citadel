import React from 'react';

import { useModelStore, type LocalModel } from '@/stores/model';
import { modelFit } from '@/utils/memory-estimator';

/**
 * The brain picker's state and its wiring to the model store.
 *
 * Every brain Samwell offers is already in the list, so there is nothing to
 * browse for: the sheet shows the ones this phone could plausibly run, with
 * the one on the device and the chosen one always kept whatever they weigh.
 *
 * Opening the sheet asks Hugging Face what each brain weighs, once, so sizes
 * and the memory check are there by the time the list is read.
 */
export function useModelSheet() {
  const models = useModelStore((s) => s.models);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const modelsHydrated = useModelStore((s) => s.modelsHydrated);
  const loadModels = useModelStore((s) => s.loadModels);
  const measureModels = useModelStore((s) => s.measureModels);
  const setActiveModel = useModelStore((s) => s.setActiveModel);

  const [visible, setVisible] = React.useState(false);

  const runnable = React.useMemo(
    () => models.filter((m) => m.isDownloaded || m.id === activeModelId || fitsThisPhone(m)),
    [models, activeModelId],
  );

  const open = React.useCallback(() => {
    setVisible(true);
    void (async () => {
      // Startup hydration normally covers the list; this covers opening before
      // that has landed.
      if (!useModelStore.getState().modelsHydrated) await loadModels();
      await measureModels();
    })();
  }, [loadModels, measureModels]);

  const close = React.useCallback(() => setVisible(false), []);

  const chooseModel = React.useCallback(
    (id: string) => {
      void setActiveModel(id);
      close();
    },
    [setActiveModel, close],
  );

  return { visible, open, close, models: runnable, activeModelId, modelsHydrated, chooseModel };
}

/** Unmeasured brains stay listed: hiding one over a missing number would be the wrong call. */
function fitsThisPhone(model: LocalModel): boolean {
  return modelFit(model.sizeBytes) !== 'wontRun';
}
