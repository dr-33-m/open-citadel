import React from 'react';
import { AppState } from 'react-native';

import { journalQuietChats, resetJournalRefusal } from '@/services/journey-writer';
import { useAccountStore } from '@/stores/account';
import { useSubscriptionStore } from '@/stores/subscription';

/**
 * Coming back to a conversation this soon still counts as being in it, so a
 * sweep on the way back in leaves it alone until it has been quiet this long.
 */
const QUIET_ON_RETURN_MS = 10 * 60_000;
/**
 * How long after launch or a return to wait before sweeping. The sweep's
 * database reads are synchronous on the JS thread, and the first seconds back
 * are when the screen is redrawing and the reader is already touching it.
 * Nothing here is urgent: a conversation that waited ten minutes can wait
 * five seconds more.
 */
const SETTLE_DELAY_MS = 5_000;
/**
 * Returns closer together than this share one sweep. iOS reports 'active'
 * after every pull of Control Center or a notification, not only after the
 * app was really away.
 */
const MIN_RETURN_GAP_MS = 60_000;

/**
 * Keeps Samwell's journal written up (see `services/journey-writer`).
 *
 * Mounted once at the root, beside `usePlanSync`, and keyed on the same
 * things the writer needs: a signed-in account with a plan. It sweeps when
 * that becomes true, when the app goes to the background (leaving the app is
 * the nearest thing to a conversation ending, so nothing has to have gone
 * quiet, and the screen is no longer being drawn, so it runs straight away),
 * and when it comes back (by which time most have).
 */
export function useJourneyWriter(): void {
  const signedIn = useAccountStore((s) => s.status === 'signedIn');
  const plan = useSubscriptionStore((s) => s.plan);

  React.useEffect(() => {
    if (!signedIn || !plan) return;
    // A plan that just arrived is a new answer to "may this account write".
    resetJournalRefusal();

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastReturnSweep = 0;
    const sweepSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        lastReturnSweep = Date.now();
        void journalQuietChats(QUIET_ON_RETURN_MS);
      }, SETTLE_DELAY_MS);
    };

    sweepSoon();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (timer) clearTimeout(timer);
        timer = null;
        void journalQuietChats(0);
      } else if (state === 'active' && Date.now() - lastReturnSweep >= MIN_RETURN_GAP_MS) {
        sweepSoon();
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [signedIn, plan]);
}
