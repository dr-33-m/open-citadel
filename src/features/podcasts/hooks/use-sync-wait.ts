import React from 'react';

import { showToast } from '@/components/toast/toast-provider';

/**
 * How long the transcript waits behind its loader for the copy being heard to
 * be matched. Usually it takes seconds; a long episode on a slow host can take
 * minutes, and the transcript is not hidden for that long.
 */
const SYNC_WAIT_MS = 20_000;

/**
 * Whether the transcript should still wait behind its loader while it is
 * matched (`time-map.ts`). Past the wait it is shown on its own clock, with a
 * toast saying so, and moves into place when the match lands.
 */
export function useSyncWait(syncing: boolean): boolean {
  const [waitedOut, setWaitedOut] = React.useState(false);
  // A new match starts a new wait.
  if (!syncing && waitedOut) setWaitedOut(false);
  React.useEffect(() => {
    if (!syncing) return;
    const timer = setTimeout(() => {
      setWaitedOut(true);
      showToast({ key: 'transcript-sync', message: 'Still syncing. The times will line up in a moment.' });
    }, SYNC_WAIT_MS);
    return () => clearTimeout(timer);
  }, [syncing]);
  return syncing && !waitedOut;
}
