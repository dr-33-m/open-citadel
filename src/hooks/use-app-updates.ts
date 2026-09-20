import * as Updates from 'expo-updates';
import React from 'react';
import { AppState } from 'react-native';

import { RotateCw } from '@/components/icons';
import { showToast } from '@/components/toast/toast-provider';

/** A return to the app this soon after the last check does not ask again. */
const CHECK_GAP_MS = 30 * 60_000;
/**
 * Away this long, and a waiting update is applied on the way back in. They
 * have been gone long enough that coming back to a fresh start is what a cold
 * launch would have given them anyway.
 */
const AWAY_RELOAD_MS = 30 * 60_000;
const TOAST_KEY = 'app-update';

/**
 * Over-the-air updates, beyond what `expo-updates` does on its own.
 *
 * On its own it checks only on a cold start and applies what it finds on the
 * next one. Phones keep apps in memory for days, so a fix could sit unused
 * for as long as nobody force-closed the app. This adds:
 *
 * - a check on each return to the app, at most every half hour;
 * - a toast once an update is downloaded, offering a restart. A toast rather
 *   than a dialog, because it is never urgent enough to stop someone
 *   mid-page, and persistent, because vanishing after three seconds would
 *   decide for them;
 * - applying it quietly on the way back in after a long absence, so declining
 *   the toast never means never getting the fix.
 *
 * Mounted once at the root. Does nothing in development builds, which load
 * from Metro and have no updates to apply.
 *
 * `canAnnounce` is whether the toast host is mounted yet. The root renders
 * nothing until fonts and the database are ready, and an update that finished
 * downloading before then would otherwise raise its toast into nowhere and be
 * marked as announced.
 */
export function useAppUpdates(canAnnounce: boolean): void {
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const pendingId = isUpdatePending ? (downloadedUpdate?.updateId ?? 'pending') : null;

  // Read by the AppState listener, which is registered once.
  const pending = React.useRef(false);
  React.useEffect(() => {
    pending.current = pendingId !== null;
  }, [pendingId]);

  // One toast per downloaded update, not one per render or per return.
  const announced = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!canAnnounce || !pendingId || announced.current === pendingId) return;
    announced.current = pendingId;
    showToast({
      key: TOAST_KEY,
      message: 'An update is ready.',
      actionIcon: RotateCw,
      actionLabel: 'Restart to update',
      dismissLabel: 'Update later',
      persistent: true,
      keepOpenOnAction: true,
      onActionPress: restartIntoUpdate,
    });
  }, [canAnnounce, pendingId]);

  React.useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    // The launch itself already checked (see the doc above).
    let lastCheck = Date.now();
    let leftAt: number | null = null;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt = Date.now();
        return;
      }
      if (state !== 'active') return;

      const away = leftAt === null ? 0 : Date.now() - leftAt;
      leftAt = null;
      if (pending.current && away >= AWAY_RELOAD_MS) {
        void Updates.reloadAsync().catch((error) => {
          console.warn('[Updates] quiet reload failed', error);
        });
        return;
      }

      if (Date.now() - lastCheck < CHECK_GAP_MS) return;
      lastCheck = Date.now();
      void checkAndDownload();
    });

    return () => subscription.remove();
  }, []);
}

/**
 * Download it if there is one. Finishing flips `isUpdatePending`, which is
 * what raises the toast. Failures are silent: no signal, or no update server
 * reachable, is not something to tell anyone about, and the next return or
 * launch tries again.
 */
async function checkAndDownload(): Promise<void> {
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (isAvailable) await Updates.fetchUpdateAsync();
  } catch (error) {
    console.warn('[Updates] check failed', error);
  }
}

function restartIntoUpdate(): void {
  // The restart takes a moment; say so rather than looking like a dead tap.
  showToast({
    key: TOAST_KEY,
    message: 'Restarting…',
    actionIcon: RotateCw,
    actionLabel: 'Restart to update',
    actionPending: true,
    persistent: true,
  });
  Updates.reloadAsync().catch((error) => {
    console.warn('[Updates] restart failed', error);
    showToast({
      key: TOAST_KEY,
      message: "Couldn't restart. The update will apply next time you open the app.",
    });
  });
}
