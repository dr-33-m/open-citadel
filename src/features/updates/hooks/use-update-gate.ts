import * as Updates from 'expo-updates';
import React from 'react';
import { AppState, Keyboard, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/toast/toast-provider';
import { spacing } from '@/constants/theme';
import { askAppGate } from '@/services/app-gate';
import { APPLICATION_ID } from '@/services/app-identity';
import { useAppGateStore } from '@/stores/app-gate';
import { haptics } from '@/utils/haptics';

import { storeLinks } from '../utils/update-gate';

/** The App Store's id for Open Citadel (`ascAppId` in eas.json). */
const APP_STORE_ID = '6789093612';

async function openStore(): Promise<void> {
  const links = storeLinks(Platform.OS, APPLICATION_ID ?? 'com.dr33m.opencitadel', APP_STORE_ID);
  try {
    await Linking.openURL(links.app);
  } catch {
    await Linking.openURL(links.web);
  }
}

/**
 * A restart onto the newer update. Already downloaded, it loads at once;
 * otherwise it is fetched first. With nothing newer to be had (no update
 * published for this build), the store is the only way forward.
 */
async function restartOntoUpdate(): Promise<void> {
  if (!Updates.isEnabled) return openStore();
  const fetched = await Updates.fetchUpdateAsync();
  if (fetched.isNew) return Updates.reloadAsync();
  return openStore();
}

/**
 * The update screen, for a copy of the app the server no longer serves.
 *
 * Asked about on launch and on every return to the app, so a phone updated
 * from the store opens straight back into the app, and one left open past a
 * new minimum is caught the next time it is picked up. There is no way past
 * it: a copy the server turns away can do nothing useful.
 */
export function useUpdateGate() {
  const update = useAppGateStore((s) => s.update);
  const insets = useSafeAreaInsets();
  const [working, setWorking] = React.useState(false);

  React.useEffect(() => {
    void askAppGate();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void askAppGate();
    });
    return () => subscription.remove();
  }, []);

  // A keyboard left up would sit over the screen's one button.
  React.useEffect(() => {
    if (update) Keyboard.dismiss();
  }, [update]);

  const onUpdate = React.useCallback(() => {
    if (!update || working) return;
    haptics.commit();
    setWorking(true);
    const go = update === 'restart' ? restartOntoUpdate() : openStore();
    go.catch(() => {
      haptics.warn();
      showToast({ message: "Couldn't get the update. Check your connection and try again.", key: 'update-gate' });
    }).finally(() => setWorking(false));
  }, [update, working]);

  return { update, working, onUpdate, bottomPadding: insets.bottom + spacing[6] };
}
