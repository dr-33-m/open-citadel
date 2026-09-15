import React from 'react';
import { AppState } from 'react-native';

import { useAccountStore } from '@/stores/account';
import { useSubscriptionStore } from '@/stores/subscription';

/**
 * A return to the foreground this soon after the last check does not ask the
 * server again. Switching apps for a moment is not news about a plan.
 */
const FOREGROUND_RECHECK_MS = 30_000;

/**
 * Keeps the plan the server holds for this account current, from anywhere.
 *
 * Mounted once at the root. The check used to live where it was drawn: the
 * chat screens asked once, and only while the status was still unknown, and
 * the Cloud panel asked on mount and on every return to the foreground, but
 * only renders in cloud mode. So in offline mode nothing asked again after
 * launch, a failed first read sat at "unreachable" indefinitely, and switching
 * to cloud looked like it made the check faster when all it did was mount the
 * panel that finally sent the request. A network call is not a property of
 * whichever screen happens to be up.
 *
 * Asks when an account becomes signed in, and again whenever the app comes
 * back to the foreground: straight away if the last read never got an answer,
 * otherwise only after `FOREGROUND_RECHECK_MS`. Concurrent asks from anywhere
 * collapse into one request inside the store.
 */
export function usePlanSync(): void {
  const accountId = useAccountStore((s) => (s.status === 'signedIn' ? s.sub : null));

  React.useEffect(() => {
    if (!accountId) return;

    let lastCheck = Date.now();
    void useSubscriptionStore.getState().refresh();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const neverAnswered = useSubscriptionStore.getState().status === 'unreachable';
      if (!neverAnswered && Date.now() - lastCheck < FOREGROUND_RECHECK_MS) return;
      lastCheck = Date.now();
      void useSubscriptionStore.getState().refresh();
    });

    return () => subscription.remove();
  }, [accountId]);
}
