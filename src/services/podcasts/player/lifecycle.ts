/** Starting, moving on from, stopping and handing over the episode in the player. */
import TrackPlayer from "@rntp/player";

import { ensureChapters } from "@/services/podcasts/chapters";
import { getEpisodeItem } from "@/services/podcasts/episodes";
import { dequeue, upNextIds } from "@/services/podcasts/queue";
import { mediaItemFrom, nativeUpNext, nowPlayingFrom, resumePosition } from "@/services/podcasts/player/media";
import { finishEpisode, persistProgress, session, track } from "@/services/podcasts/player/session";
import { applyCommands } from "@/services/player/commands";
import { readyPlayer } from "@/services/player/events";
import { clearStarting, clearWaits, markStarting, onTakenOver, store, takePlayerFor } from "@/services/player/session";
import { selectEpisode } from "@/stores/player";
import type { EpisodeItem } from "@/services/podcasts/records";
import { getShow } from "@/services/podcasts/shows";
import { podcastPrefs, usePodcastPrefs } from "@/stores/podcast-prefs";
import { invalidatePodcastLibrary } from "@/query-manager/podcasts/invalidate";

/** Takes on an episode that has just become current, however it got there. */
export async function becomeCurrent(item: EpisodeItem, startAt: number | null): Promise<void> {
  session.letGo.delete(item.id);
  // Seek before anything is awaited: after a native transition the audio is
  // already running from 0:00, and every moment spent reading is heard.
  let position = startAt ?? resumePosition(item, 0);
  if (position > 0) TrackPlayer.seekTo(position);
  const show = await getShow(item.podcastId);
  const skipIntro = show?.skipIntroSec ?? 0;
  if (startAt == null && skipIntro > position) {
    position = skipIntro;
    TrackPlayer.seekTo(position);
  }
  const speed = show?.playbackSpeed ?? podcastPrefs().playbackSpeed;
  TrackPlayer.setPlaybackSpeed(speed);
  track(item, position, show?.skipEndingSec ?? 0);
  store().patch({ current: nowPlayingFrom(item), loaded: true, speed, error: null });
  usePodcastPrefs.getState().set("nowPlayingEpisodeId", item.id);
  // Playing it is the decision Up Next was holding it for.
  if (item.queuePosition != null) await dequeue([item.id]);
  invalidatePodcastLibrary();
  void ensureChapters(item.id).then((added) => added && invalidatePodcastLibrary());
}

/**
 * Plays an episode from where it was left (or from `startAt`), with Up Next
 * queued behind it.
 */
export async function startEpisode(episodeId: string, startAt: number | null = null): Promise<void> {
  if (!readyPlayer()) {
    store().patch({ error: "Audio playback is not available on this device." });
    return;
  }
  // The press is answered now; loading the episode can take a moment.
  markStarting();
  await takePlayerFor("episode");
  await persistProgress();
  const item = await getEpisodeItem(episodeId);
  if (!item) {
    clearStarting();
    return;
  }
  applyCommands("episode");
  const upNext = await nativeUpNext(item.id);
  // Decided before loading, so the queue loads where it starts: where it was
  // left, or past the intro.
  const show = await getShow(item.podcastId);
  const start = startAt ?? resumePosition(item, show?.skipIntroSec ?? 0);
  // Tracked before the native queue changes, so the transition event that
  // loading fires is recognised as this episode rather than read as a skip.
  track(item, start);
  TrackPlayer.setMediaItems([mediaItemFrom(item, start), ...upNext], 0);
  await becomeCurrent(item, start);
  TrackPlayer.play();
}

/**
 * After an episode ends on its own: the next in Up Next, from the database
 * rather than the native queue, which only holds the first few ahead.
 */
export async function advance(): Promise<void> {
  const [next] = await upNextIds();
  if (next) await startEpisode(next);
  else await stopPlayback();
}

/**
 * The episode in the player was marked played by hand: let go of it first (so
 * no tick lands a position back on it), finish it, and move on as its end
 * would have.
 */
export async function finishCurrentAndAdvance(): Promise<void> {
  const id = selectEpisode(store())?.episodeId;
  if (!id) return;
  session.tracking = null;
  await finishEpisode(id);
  if (store().loaded) await advance();
  else await stopPlayback();
}

/** Stops and empties the player; the mini player goes away. */
export async function stopPlayback(): Promise<void> {
  const id = selectEpisode(store())?.episodeId;
  if (id) session.letGo.add(id);
  await persistProgress();
  if (store().loaded) TrackPlayer.clear();
  session.tracking = null;
  clearWaits();
  store().patch({ current: null, loaded: false, isPlaying: false, isBuffering: false, sleep: null });
  usePodcastPrefs.getState().set("nowPlayingEpisodeId", null);
  invalidatePodcastLibrary();
}

/**
 * Read-aloud is about to take the player for its lock-screen card: save the
 * podcast's place and let go, keeping it in the mini player to resume later.
 */
export function releasePlayerForSpeech(): void {
  const { loaded } = store();
  const current = selectEpisode(store());
  if (!loaded || !current) return;
  const { position } = TrackPlayer.getProgress();
  session.letGo.add(current.episodeId);
  void persistProgress();
  TrackPlayer.pause();
  session.tracking = null;
  clearWaits();
  store().patch({
    current: { ...current, positionSec: position },
    loaded: false,
    isPlaying: false,
    isBuffering: false,
    sleep: null,
  });
}

/**
 * Re-mirrors Up Next into the native queue after it changes in the app, so the
 * lock screen's "next" goes where the listener now expects.
 */
export async function syncNativeQueue(): Promise<void> {
  const { loaded } = store();
  const current = selectEpisode(store());
  if (!loaded || !current) return;
  const active = TrackPlayer.getActiveMediaItemIndex() ?? 0;
  const length = TrackPlayer.getQueue().length;
  if (length > active + 1) TrackPlayer.removeMediaItems(active + 1, length);
  const upNext = await nativeUpNext(current.episodeId);
  if (upNext.length > 0) TrackPlayer.addMediaItems(upNext);
}

/**
 * A book is taking the player: the episode's place is saved and it steps out
 * of the mini player, as it would for another episode. The book loads its own
 * queue over this one, so nothing is cleared here.
 */
onTakenOver("episode", async () => {
  const id = selectEpisode(store())?.episodeId;
  if (id) session.letGo.add(id);
  await persistProgress();
  session.tracking = null;
  usePodcastPrefs.getState().set("nowPlayingEpisodeId", null);
  invalidatePodcastLibrary();
});
