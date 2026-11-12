import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';

import type { EngineMode } from '@/components/settings/engine-info-sheet';
import { isSettingsPane, type SettingsPane } from '@/features/settings/utils/panes';
import { backTo } from '@/navigation/navigate';
import { useSettledOnce } from '@/navigation/use-settled-once';

/**
 * One page of Settings: which it is, the way back out of it, and whether it
 * has landed, which is when its controls are built (`Handover`).
 *
 * `panel=cloud` opens Samwell's page on its cloud half, for a deep link that
 * wants the plans. A page opened straight from elsewhere (the chat's "set
 * Samwell up") is pushed on its own, so Back returns there, not to a list the
 * reader never saw.
 */
export function useSettingsPane(): {
  pane: SettingsPane | null;
  landed: boolean;
  onLeave: () => void;
  onRequestAccount: () => void;
  initialMode?: EngineMode;
} {
  const router = useRouter();
  const params = useLocalSearchParams<{ pane?: string; panel?: string }>();
  const pane = isSettingsPane(params.pane) ? params.pane : null;
  const landed = useSettledOnce();
  const onLeave = React.useCallback(() => backTo(router, '/settings'), [router]);
  const onRequestAccount = React.useCallback(() => router.push('/settings/profile'), [router]);
  const initialMode: EngineMode | undefined = params.panel === 'cloud' ? 'cloud' : undefined;

  return { pane, landed, onLeave, onRequestAccount, initialMode };
}
