import Storage from 'expo-sqlite/kv-store';

import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import { readVerdict, type GateVerdict } from '@/features/updates/utils/update-gate';
import { identifyCloudFetches } from '@/lib/network/identify-fetch';
import { APP_IDENTITY, APP_IDENTITY_HEADERS } from '@/services/app-identity';
import { reportUpdateRequired, useAppGateStore } from '@/stores/app-gate';

const KEY = 'app-gate';

/**
 * The last verdict, kept with the copy of the app it was about. Read back on
 * launch so a phone that is offline still shows the update screen, and
 * dropped once the copy changes: an app the store has just updated must not
 * open onto the screen that sent it there.
 */
function remembered(): GateVerdict | null {
  try {
    const saved = JSON.parse(Storage.getItemSync(KEY) ?? 'null') as { identity?: string; update?: GateVerdict } | null;
    return saved?.identity === APP_IDENTITY ? (saved.update ?? null) : null;
  } catch {
    return null;
  }
}

function remember(update: GateVerdict | null): void {
  void Storage.setItem(KEY, JSON.stringify({ identity: APP_IDENTITY, update })).catch(() => undefined);
}

/**
 * Every request to Samwell Cloud carries which copy of the app sent it, any
 * 426 puts the update screen up, and the last verdict is read back and kept.
 * Called once, before the first request.
 */
export function installAppGate(): void {
  useAppGateStore.getState().settle(remembered());
  useAppGateStore.subscribe((state, previous) => {
    if (state.update !== previous.update) remember(state.update);
  });
  identifyCloudFetches({
    headers: APP_IDENTITY_HEADERS,
    onUpgradeRequired: (response) => {
      void response
        .json()
        .then(readVerdict, () => null)
        .then(reportUpdateRequired);
    },
  });
}

/**
 * Asks the server whether this copy is still served, and settles the gate on
 * its answer, lifting it too once the phone has been updated. No answer
 * (offline, a server fault) changes nothing: the remembered verdict stands.
 */
export async function askAppGate(signal?: AbortSignal): Promise<void> {
  if (!SAMWELL_CLOUD_BASE_URL) return;
  try {
    const response = await fetch(`${SAMWELL_CLOUD_BASE_URL}/app/gate`, { signal });
    if (!response.ok) return;
    useAppGateStore.getState().settle(readVerdict(await response.json()));
  } catch {
    // Not reached: keep whatever was last known.
  }
}
