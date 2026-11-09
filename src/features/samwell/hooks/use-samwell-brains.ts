import React from 'react';

import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { useSettingsStore } from '@/stores/settings';

/**
 * Whether the brains on offer are the cloud's: they follow the engine he runs
 * on. One rule, read by the toolbox's Brain row and by the sheet it raises,
 * so the two cannot disagree about which list to show.
 */
export function useBrainSheetCloud(): boolean {
  return useSamwellReadiness().mode === 'cloud';
}

/** A plan bought from the wall is a plan to use: Samwell moves to the cloud. */
export function useStartInCloud() {
  const setSamwellMode = useSettingsStore((s) => s.setSamwellMode);
  return React.useCallback(() => void setSamwellMode('cloud'), [setSamwellMode]);
}
