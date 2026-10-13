import React from 'react';
import { AppState } from 'react-native';

import { saveMissingCovers } from '@/services/podcasts/download-covers';
import { resumeInterruptedDownloads } from '@/services/podcasts/downloads';
import { restoreNowPlaying } from '@/services/podcasts/player';
import { refreshAllShows } from '@/services/podcasts/refresh';
import { usePodcastPrefs } from '@/stores/podcast-prefs';

/** Long enough after launch that the check stays out of the way of the first screen settling. */
const LAUNCH_DELAY_MS = 4000;

/**
 * The podcast work that belongs to the app rather than to any screen: put the
 * last episode back in the mini player, carry on downloads a closed app cut
 * short, fetch the cover of any download still without one, and look for new
 * episodes on launch and whenever the app comes back to the front (only shows
 * past the refresh interval are fetched, so coming back every few minutes
 * costs nothing).
 *
 * Nothing here runs for someone who has never opened Podcasts.
 */
export function usePodcastLifecycle(ready: boolean): void {
  // Reactive, so someone who starts or imports during this session is covered
  // from that moment rather than from the next launch.
  const active = usePodcastPrefs((s) => s.onboarding !== 'pending');
  React.useEffect(() => {
    if (!ready || !active) return;
    void restoreNowPlaying();
    const launch = setTimeout(() => {
      void resumeInterruptedDownloads();
      void saveMissingCovers();
      void refreshAllShows(false);
    }, LAUNCH_DELAY_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshAllShows(false);
    });
    return () => {
      clearTimeout(launch);
      sub.remove();
    };
  }, [active, ready]);
}
