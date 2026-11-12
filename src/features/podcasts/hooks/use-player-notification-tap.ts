import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React from 'react';

import { isPlayerNotificationLink } from '@/navigation/system-links';
import { usePlayer } from '@/stores/player';

/** How long a launch waits for the last session's episode before giving up on it. */
const RESTORE_WAIT_MS = 4000;

/** Resolves once the player holds an episode again, or after the wait runs out. */
function episodeRestored(): Promise<void> {
  if (usePlayer.getState().loaded) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(done, RESTORE_WAIT_MS);
    const unsubscribe = usePlayer.subscribe((state) => {
      if (state.loaded) done();
    });
  });
}

/**
 * A tap on the media notification opens the player, as it does in any audio
 * app, instead of leaving the listener on whatever screen the app was last on.
 *
 * Only while an episode is what the notification is showing. Read-aloud
 * borrows the same notification for a book, and a tap on that one should
 * bring the book back, which bringing the app forward already does.
 *
 * `navigate`, not `push`: with the player already open, a second tap is a
 * no-op rather than a second player on top of the first.
 */
export function usePlayerNotificationTap(ready: boolean): void {
  const router = useRouter();
  React.useEffect(() => {
    if (!ready) return undefined;
    const open = async (url: string | null, launched: boolean) => {
      if (!isPlayerNotificationLink(url)) return;
      // Launched by the tap: the episode is still being read back from the
      // last session (`usePodcastLifecycle`), and there is nothing to open the
      // player on until it is.
      if (launched) await episodeRestored();
      const { current, loaded } = usePlayer.getState();
      if (current && loaded) router.navigate('/podcasts/player');
    };
    void Linking.getInitialURL().then((url) => open(url, true));
    const subscription = Linking.addEventListener('url', ({ url }) => void open(url, false));
    return () => subscription.remove();
  }, [ready, router]);
}
