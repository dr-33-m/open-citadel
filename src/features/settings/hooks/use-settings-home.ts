import { useRouter } from 'expo-router';
import React from 'react';

import { useWarmPlanOffer } from '@/features/billing/hooks/use-plan-offer';
import type { SettingsHomeProps } from '@/features/settings/components/settings-home';
import { useLightMode } from '@/features/settings/hooks/use-light-mode';
import { useSettingsSummaries } from '@/features/settings/hooks/use-settings-summaries';
import type { SettingsPane } from '@/features/settings/utils/panes';
import { useCloudIdentity } from '@/hooks/use-cloud-identity';
import { backTo } from '@/navigation/navigate';
import { useSettledOnce } from '@/navigation/use-settled-once';
import { prefetchDeviceVoices } from '@/query-manager/device-voices';
import { NATIVE_VOICE_AVAILABLE } from '@/services/device-tts/catalogue';
import { useSettingsStore } from '@/stores/settings';

/** Presses closer together than this are one press. */
const PUSH_GUARD_MS = 600;

/**
 * The Settings list: each row's line of state, the two things it sets itself
 * (the theme, the note), and a press on a row pushing that row's page.
 *
 * It also asks ahead for what two pages draw from, once the drawer has
 * landed: the plans on sale and the phone's own voices. Both are slow the
 * first time, so by the time a page is opened its answer is in the cache.
 * Asked, not built: the pages themselves are built only when opened.
 */
export function useSettingsHome() {
  const router = useRouter();
  const close = React.useCallback(() => backTo(router, '/'), [router]);
  // One page per press. Each page is a screen of its own now, so a quick
  // second tap on a row while the first push is starting would stack the same
  // page twice, and Back would land on its copy.
  const lastPush = React.useRef(0);
  const open = React.useCallback(
    (pane: SettingsPane) => {
      const now = Date.now();
      if (now - lastPush.current < PUSH_GUARD_MS) return;
      lastPush.current = now;
      router.push(`/settings/${pane}`);
    },
    [router],
  );

  const username = useSettingsStore((s) => s.username);
  const summaries = useSettingsSummaries();
  const theme = useLightMode();
  const [noteOpen, setNoteOpen] = React.useState(false);
  const openNote = React.useCallback(() => setNoteOpen(true), []);
  const closeNote = React.useCallback(() => setNoteOpen(false), []);

  const landed = useSettledOnce();
  // Not before the identity settles: that is when the purchases SDK has been started.
  const identityKnown = useCloudIdentity().kind !== 'unknown';
  useWarmPlanOffer(landed && identityKnown);
  React.useEffect(() => {
    if (landed && NATIVE_VOICE_AVAILABLE) prefetchDeviceVoices();
  }, [landed]);

  const home: SettingsHomeProps = {
    name: username || 'Add your name',
    summaries,
    ...theme,
    onOpen: open,
    onOpenNote: openNote,
  };

  return { close, home, note: { visible: noteOpen, onClose: closeNote } };
}
