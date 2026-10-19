/** What the player's controls do: play and pause, seek, skip, speed and sleep. */
import TrackPlayer from "@rntp/player";

import { heldPosition } from "@/utils/seek-hold";
import { saveProgress } from "@/services/podcasts/episode-state";
import { attachListeners } from "@/services/podcasts/player/events";
import { startEpisode } from "@/services/podcasts/player/lifecycle";
import { markSeeking, markStarting, session, store } from "@/services/podcasts/player/session";
import { selectPlaying } from "@/stores/podcast-player";
import { getShow, updateShowSettings } from "@/services/podcasts/shows";
import { usePodcastPrefs } from "@/stores/podcast-prefs";

/**
 * Plays an episode from where it was left (or from `startAt`), with Up Next
 * queued behind it.
 */
export async function playEpisode(episodeId: string, startAt: number | null = null): Promise<void> {
  attachListeners();
  await startEpisode(episodeId, startAt);
}

/**
 * Plays an episode from a moment: a timestamp in its notes, a line of its
 * transcript, a time Samwell cited. A seek, and play if paused, when it is
 * the episode already in the player; otherwise the episode started there.
 */
export async function playEpisodeFrom(episodeId: string, seconds: number): Promise<void> {
  const { current, loaded } = store();
  if (current?.episodeId !== episodeId || !loaded) {
    await playEpisode(episodeId, seconds);
    return;
  }
  seekTo(seconds);
  if (!selectPlaying(store())) await togglePlayback();
}

/**
 * Play or pause, answering the press at once: pausing flips the state now
 * rather than when the native player reports it, and playing marks the
 * player as starting, so the control shows its loader through a seek or a
 * buffer instead of sitting on Play looking unpressed.
 */
export async function togglePlayback(): Promise<void> {
  const { current, loaded, isPlaying, starting } = store();
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

export function seekTo(seconds: number): void {
  const { loaded, current } = store();
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
  markSeeking();
  // Held until the native player has caught up, so nothing polling it in the
  // meantime draws the old position (see `seek-hold`).
  store().patch({ seekHold: { target, at: Date.now() } });
  TrackPlayer.seekTo(target);
  if (session.tracking) {
    session.tracking.lastPosition = seconds;
    session.tracking.lastTickAt = Date.now();
  }
}

export function skipBy(seconds: number): void {
  const { loaded, current } = store();
  if (!loaded) {
    if (current) seekTo(current.positionSec + seconds);
    return;
  }
  // From where the last seek is going, not where the player still says it is:
  // two quick skips should add up.
  const { position } = heldPosition(TrackPlayer.getProgress().position, store().seekHold, Date.now());
  seekTo(position + seconds);
}

/**
 * The speed control. A show with a speed of its own keeps it (and this
 * changes it); otherwise this is the speed for everything, as in AntennaPod
 * where the per-show setting overrides the global one.
 */
export async function setSpeed(speed: number): Promise<void> {
  const { current, loaded } = store();
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

/** Pauses after a number of minutes (fading the last ten seconds out), at the episode's end, or never. */
export function setSleepTimer(choice: number | "episode" | null): void {
  if (!store().loaded) return;
  if (choice === null) {
    TrackPlayer.cancelSleepTimer();
    store().patch({ sleep: null });
  } else if (choice === "episode") {
    TrackPlayer.sleepAfterMediaItemAtIndex();
    store().patch({ sleep: { kind: "episode" } });
  } else {
    TrackPlayer.sleepAfterTime(choice * 60, { fadeOutSeconds: 10 });
    store().patch({ sleep: { kind: "time", endsAt: Date.now() + choice * 60_000, minutes: choice } });
  }
}
