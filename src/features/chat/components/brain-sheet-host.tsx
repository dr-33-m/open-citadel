import React from 'react';
import { Keyboard } from 'react-native';

import { CloudModelSheet } from '@/features/settings/components/cloud-model-sheet';
import { ModelPickerSheet } from '@/features/settings/components/model-picker-sheet';
import { useModelSheet } from '@/features/settings/hooks/use-model-sheet';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

export type BrainSheetHandle = { open: () => void };

/** The host's ref, and a stable way to raise it with the keyboard put away first. */
export function useBrainSheet() {
  const ref = React.useRef<BrainSheetHandle>(null);
  const open = React.useCallback(() => {
    Keyboard.dismiss();
    ref.current?.open();
  }, []);
  return { ref, open };
}

interface BrainSheetHostProps {
  ref: React.Ref<BrainSheetHandle>;
  /** Which brains: the cloud's, or the ones on this phone. */
  cloud: boolean;
}

/**
 * The brain picker for the composer's toolbox, holding its own open state and
 * opened through a ref, so raising it redraws this and not Samwell's page
 * around it (see `PlansSheetHost`). The very sheets Settings opens: the
 * cloud's tiers (`CloudModelSheet`) or the phone's list (`ModelPickerSheet`),
 * so a choice made in either place is the same choice.
 */
export function BrainSheetHost({ ref, cloud }: BrainSheetHostProps) {
  const tokens = useThemeTokens();
  const [cloudVisible, setCloudVisible] = React.useState(false);
  const device = useModelSheet();
  const { open: openDevice } = device;
  React.useImperativeHandle(ref, () => ({ open: () => (cloud ? setCloudVisible(true) : openDevice()) }), [cloud, openDevice]);

  const models = useSubscriptionStore((s) => s.models);
  const plan = useSubscriptionStore((s) => s.plan);
  const cloudModelId = useSettingsStore((s) => s.cloudModelId);
  const setCloudModelId = useSettingsStore((s) => s.setCloudModelId);
  const deleteModel = useModelStore((s) => s.deleteModel);
  const closeCloud = React.useCallback(() => setCloudVisible(false), []);
  const chooseCloud = React.useCallback(
    (id: string) => {
      setCloudModelId(id);
      setCloudVisible(false);
    },
    [setCloudModelId],
  );
  // A swipe's reach point is its confirmation, as in Settings.
  const deleteSwiped = React.useCallback((id: string) => void deleteModel(id), [deleteModel]);

  return cloud ? (
    <CloudModelSheet visible={cloudVisible} onClose={closeCloud} onSelect={chooseCloud} activeId={cloudModelId} models={models} plan={plan} />
  ) : (
    <ModelPickerSheet
      sheet={device}
      mutedForeground={tokens['--color-muted-foreground']}
      primary={tokens['--color-primary']}
      onDelete={deleteSwiped}
    />
  );
}
