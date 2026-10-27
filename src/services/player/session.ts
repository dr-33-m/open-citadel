/**
 * What the player's controls show while they wait on the native player, for
 * whatever is in it: play pressed and the audio not yet sounding (`starting`),
 * a seek sent and the player not yet ready at the new place (`seeking`).
 *
 * Shared by episodes and books (`services/podcasts/player`, `services/audiobook`),
 * since both drive the same native player and the same controls.
 */
import TrackPlayer, { PlaybackState } from '@rntp/player';

import { usePlayer } from '@/stores/player';

export function store() {
  return usePlayer.getState();
}

/** Longest the loader shows for a play that never reports back, so it cannot spin for ever. */
const STARTING_TIMEOUT_MS = 15_000;
let startingTimer: ReturnType<typeof setTimeout> | null = null;

/** Play was asked for: the controls show their loader until the audio sounds (see `events`). */
export function markStarting(): void {
  store().patch({ starting: true });
  if (startingTimer) clearTimeout(startingTimer);
  startingTimer = setTimeout(() => {
    startingTimer = null;
    if (store().starting) store().patch({ starting: false });
  }, STARTING_TIMEOUT_MS);
}

/** The audio sounded, stopped or failed: whatever play was waiting for is over. */
export function clearStarting(): void {
  if (startingTimer) clearTimeout(startingTimer);
  startingTimer = null;
  if (store().starting) store().patch({ starting: false });
}

/** How often a seek is checked on. */
const SEEK_POLL_MS = 150;
/**
 * Before the first check: the player reports a seek's buffering a moment
 * after it is sent, so "ready" read sooner is still the place it left.
 */
const SEEK_SETTLE_MS = 250;
let seekTimer: ReturnType<typeof setInterval> | null = null;

/**
 * A seek was sent: the controls show their loader until the player is ready
 * at the new place. Polled rather than taken from the state events, because a
 * seek inside what is already buffered can be over before the player reports
 * any change at all, and then no event would ever end the wait.
 *
 * Once ready, a seek made while playing is playing again: if the native
 * player never reported the dip, `starting` is cleared here instead of by
 * its event. One made while paused calls `onSettledPaused`, since no progress
 * tick will save the new place.
 */
export function markSeeking(onSettledPaused?: () => void): void {
  store().patch({ seeking: true });
  if (seekTimer) clearInterval(seekTimer);
  const sentAt = Date.now();
  seekTimer = setInterval(() => {
    const waited = Date.now() - sentAt;
    if (waited < SEEK_SETTLE_MS) return;
    const state = TrackPlayer.getPlaybackState();
    if (state === PlaybackState.Buffering && waited < STARTING_TIMEOUT_MS) return;
    clearSeeking();
    if (state === PlaybackState.Ready && TrackPlayer.isPlaying()) {
      store().patch({ isPlaying: true });
      clearStarting();
    } else {
      onSettledPaused?.();
    }
  }, SEEK_POLL_MS);
}

/** The seek arrived, failed, or the player let go: nothing is waiting on it any more. */
export function clearSeeking(): void {
  if (seekTimer) clearInterval(seekTimer);
  seekTimer = null;
  if (store().seeking) store().patch({ seeking: false });
}

/** Forget every wait: the player has been emptied or handed to something else. */
export function clearWaits(): void {
  clearStarting();
  clearSeeking();
}

/** How each kind lets go of the player when another kind takes it. */
const letGoers = new Map<'episode' | 'book', () => Promise<void> | void>();

/** A kind of thing that plays says how it steps aside: its place saved, its tracking dropped. */
export function onTakenOver(kind: 'episode' | 'book', letGo: () => Promise<void> | void): void {
  letGoers.set(kind, letGo);
}

/**
 * `kind` is about to load into the player: whatever else is in it saves its
 * place and steps aside first, as starting another episode would have.
 */
export async function takePlayerFor(kind: 'episode' | 'book'): Promise<void> {
  const current = store().current;
  if (!current || current.kind === kind) return;
  await letGoers.get(current.kind)?.();
}
