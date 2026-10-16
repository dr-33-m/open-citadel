import React from 'react';

import { useBrainSheetHost, type BrainSheetHandle } from '@/features/chat/hooks/use-brain-sheet';
import { CloudModelSheet } from '@/features/settings/components/cloud-model-sheet';
import { ModelPickerSheet } from '@/features/settings/components/model-picker-sheet';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

interface BrainSheetHostProps {
  ref: React.Ref<BrainSheetHandle>;
  /** Which brains: the cloud's, or the ones on this phone. */
  cloud: boolean;
}

/**
 * The brain picker for the composer's toolbox, holding its own open state and
 * opened through a ref (`useBrainSheet`), so raising it redraws this and not
 * Samwell's page around it (see `PlansSheetHost`). The very sheets Settings
 * opens: the cloud's tiers (`CloudModelSheet`) or the phone's list
 * (`ModelPickerSheet`), so a choice made in either place is the same choice.
 */
export function BrainSheetHost({ ref, cloud }: BrainSheetHostProps) {
  const tokens = useThemeTokens();
  const { cloudSheet, device, onDelete } = useBrainSheetHost(ref, cloud);
  return cloud ? (
    <CloudModelSheet {...cloudSheet} />
  ) : (
    <ModelPickerSheet sheet={device} mutedForeground={tokens['--color-muted-foreground']} primary={tokens['--color-primary']} onDelete={onDelete} />
  );
}
