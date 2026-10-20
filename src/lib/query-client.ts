import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { watchConnection } from '@/lib/network';

/**
 * The app's one query cache.
 *
 * A module, not something made inside a component, because services write to
 * the library from outside React (the player's background task, a refresh
 * finishing) and have to be able to tell the cache so.
 *
 * Defaults are for network reads. The library's own queries (SQLite) override
 * them: they never go stale on a timer, only when a write says so. See
 * `query-manager/podcasts/options.ts`.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      // A read is tried whether or not the phone says it is connected, and
      // fails at once when it is not: every screen already draws that failure
      // ("check your connection"), where a read held back until the phone is
      // online would leave a skeleton up with nothing to say. What knowing
      // about the connection buys is the other half, below: a read that
      // failed, or has gone stale, is asked again when the connection returns.
      networkMode: 'always',
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
      // Not held back offline either. Several are not network calls at all
      // (an import, an unfollow), and the ones that are should fail and say so.
      networkMode: 'always',
    },
  },
});

/*
 * "Window focus" is the app coming back to the front. A stale network query
 * (a chart, a search) refetches then; the library's queries never go stale on
 * their own, so they do not.
 */
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
  return () => subscription.remove();
});

/*
 * "Online" is `lib/network`'s answer: the phone has a network and Samwell
 * Cloud answers. Without this the cache assumed it always did, so a chart that
 * failed on the train stayed failed until its screen was reopened. With it,
 * coming back online refetches what is on screen and failed or stale. The
 * library's queries are never stale on their own, so they are left alone.
 */
onlineManager.setEventListener((setOnline) => watchConnection(setOnline));
