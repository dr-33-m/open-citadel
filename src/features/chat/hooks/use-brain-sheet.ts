import React from 'react';

import { useModelSheet } from '@/features/settings/hooks/use-model-sheet';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

export type BrainSheetHandle = { open: () => void };

/** The host's ref, and a stable way to raise it. */
export function useBrainSheet() {
  const ref = React.useRef<BrainSheetHandle>(null);
  const open = React.useCallback(() => ref.current?.open(), []);
  return { ref, open };
}

/**
 * Everything `BrainSheetHost` draws from: its own open state, raised through
 * the ref, and the brains and the choice from the stores, so a choice made
 * here is the one Settings shows.
 */
export function useBrainSheetHost(ref: React.Ref<BrainSheetHandle>, cloud: boolean) {
  const [cloudVisible, setCloudVisible] = React.useState(false);
  const device = useModelSheet();
  const { open: openDevice } = device;
  React.useImperativeHandle(ref, () => ({ open: () => (cloud ? setCloudVisible(true) : openDevice()) }), [cloud, openDevice]);

  const models = useSubscriptionStore((s) => s.models);
  const plan = useSubscriptionStore((s) => s.plan);
  const activeId = useSettingsStore((s) => s.cloudModelId);
  const setCloudModelId = useSettingsStore((s) => s.setCloudModelId);
  const deleteModel = useModelStore((s) => s.deleteModel);
  const onClose = React.useCallback(() => setCloudVisible(false), []);
  const onSelect = React.useCallback(
    (id: string) => {
      setCloudModelId(id);
      setCloudVisible(false);
    },
    [setCloudModelId],
  );
  // A swipe's reach point is its confirmation, as in Settings.
  const onDelete = React.useCallback((id: string) => void deleteModel(id), [deleteModel]);

  return { cloudSheet: { visible: cloudVisible, onClose, onSelect, activeId, models, plan }, device, onDelete };
}
