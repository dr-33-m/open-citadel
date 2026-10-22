/** What the player's controls do to an episode: play and pause, seek, skip, speed and sleep. */
import TrackPlayer from "@rntp/player";

import { heldPosition } from "@/utils/seek-hold";
import { saveProgress } from "@/services/podcasts/episode-state";
import { startEpisode } from "@/services/podcasts/player/lifecycle";
import { session, settlePausedSeek } from "@/services/podcasts/player/session";
import { markSeeking, markStarting, store } from "@/services/player/session";
import { selectEpisode, selectPlaying } from "@/stores/player";
import { getShow, updateShowSettings } from "@/services/podcasts/shows";
import { usePodcastPrefs } from "@/stores/podcast-prefs";

/**
 * Plays an episode from where it was left (or from `startAt`), with Up Next
 * queued behind it.
 */
export async function playEpisode(episodeId: string, startAt: number | null = null): Promise<void> {
  await startEpisode(episodeId, startAt);
}

/**
 * Plays an episode from a moment: a timestamp in its notes, a line of its
 * transcript, a time Samwell cited. A seek, and play if paused, when it is
 * the episode already in the player; otherwise the episode started there.
 */
export async function playEpisodeFrom(episodeId: string, seconds: number): Promise<void> {
  const { loaded } = store();
  if (selectEpisode(store())?.episodeId !== episodeId || !loaded) {
    await playEpisode(episodeId, seconds);
    return;
  }
  seekEpisode(seconds);
  if (!selectPlaying(store())) await toggleEpisode();
}

/**
 * Play or pause, answering the press at once: pausing flips the state now
 * rather than when the native player reports it, and playing marks the
 * player as starting, so the control shows its loader through a seek or a
 * buffer instead of sitting on Play looking unpressed.
 */
export async function toggleEpisode(): Promise<void> {
  const { loaded, isPlaying, starting } = store();
  const current = selectEpisode(store());
  if (!current) return;
  if (!loaded) {
    await playEpisode(current.episodeId);
    return;
  }
  if (isPlaying || starting) {
    store().patch({ isPlaying: false, starting: false });
    TrackPlayer.pause();
  } else {
    markStarting();
    TrackPlayer.play();
  }
}

export function seekEpisode(seconds: number): void {
  const { loaded } = store();
  const current = selectEpisode(store());
  if (!loaded) {
    // Restored after a restart and not loaded yet: move where Play will
    // start from, rather than ignoring the scrub.
    if (!current) return;
    const target = Math.max(0, Math.min(seconds, current.durationSec || seconds));
    store().patch({ current: { ...current, positionSec: target } });
    void saveProgress({ id: current.episodeId, podcastId: current.podcastId }, target, 0);
    return;
  }
  const target = Math.max(0, seconds);
  // The native player stops "playing" while it buffers the new place. Kept
  // as playing (the loader, then Pause) rather than flicking to Play and
  // back; a seek made while paused shows the loader and stays paused.
  if (selectPlaying(store())) markStarting();
  markSeeking(() => void settlePausedSeek());
  // Held until the native player has caught up, so nothing polling it in the
  // meantime draws the old position (see `seek-hold`).
  store().patch({ seekHold: { target, at: Date.now() } });
  TrackPlayer.seekTo(target);
  if (session.tracking) {
    session.tracking.lastPosition = seconds;
    session.tracking.lastTickAt = Date.now();
  }
}

export function skipEpisode(seconds: number): void {
  const { loaded } = store();
  const current = selectEpisode(store());
  if (!loaded) {
    if (current) seekEpisode(current.positionSec + seconds);
    return;
  }
  // From where the last seek is going, not where the player still says it is:
  // two quick skips should add up.
  const { position } = heldPosition(TrackPlayer.getProgress().position, store().seekHold, Date.now());
  seekEpisode(position + seconds);
}

/**
 * The speed control. A show with a speed of its own keeps it (and this
 * changes it); otherwise this is the speed for everything, as in AntennaPod
 * where the per-show setting overrides the global one.
 */
export async function setEpisodeSpeed(speed: number): Promise<void> {
  const { loaded } = store();
  const current = selectEpisode(store());
  if (loaded) TrackPlayer.setPlaybackSpeed(speed);
  store().patch({ speed });
  if (current) {
    const show = await getShow(current.podcastId);
    if (show?.playbackSpeed != null) {
      await updateShowSettings(show.id, { playbackSpeed: speed });
      return;
    }
  }
  usePodcastPrefs.getState().set("playbackSpeed", speed);
}

/** Pauses at the episode's end: it is the item playing, so the native player knows where that is. */
export function sleepAtEpisodeEnd(): void {
  TrackPlayer.sleepAfterMediaItemAtIndex();
  store().patch({ sleep: { kind: "end" } });
}
