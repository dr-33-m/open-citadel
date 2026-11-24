/** Starting, moving on from, stopping and handing over the episode in the player. */
import TrackPlayer, { type MediaItem } from "@rntp/player";

import { ensureChapters } from "@/services/podcasts/chapters";
import { getEpisodeItem } from "@/services/podcasts/episodes";
import { dequeue } from "@/services/podcasts/queue";
import { episodesAhead, mediaItemFrom, nativeUpNext, nowPlayingFrom, resumePosition } from "@/services/podcasts/player/media";
import { finishEpisode, persistProgress, session, track } from "@/services/podcasts/player/session";
import { applyCommands } from "@/services/player/commands";
import { readyPlayer } from "@/services/player/events";
import { clearStarting, clearWaits, markStarting, onTakenOver, store, takePlayerFor } from "@/services/player/session";
import { selectEpisode } from "@/stores/player";
import type { EpisodeItem } from "@/services/podcasts/records";
import { getShow } from "@/services/podcasts/shows";
import { copyToPlay, rememberQueuedCopy, type AudioCopy } from "@/services/podcasts/transcript/audio-copy";
import { ensureTimeMap, transcriptToAudio } from "@/services/podcasts/transcript/time-map";
import { podcastPrefs, usePodcastPrefs } from "@/stores/podcast-prefs";
import { invalidatePodcastLibrary } from "@/query-manager/podcasts/invalidate";

/** The latest `syncNativeQueue`; anything loading the native queue also moves it on, so older runs stand down. */
let syncRun = 0;

/** Loads the native queue afresh, the first item playing; a `syncNativeQueue` still reading stands down. */
export function loadNativeQueue(items: MediaItem[]): void {
  syncRun += 1;
  TrackPlayer.setMediaItems(items, 0);
}

/**
 * Takes on an episode that has just become current, however it got there.
 * `copy` is the copy of it a press of play gave the player (`copyToPlay`);
 * the next in the queue plays its file or the feed's address, which is
 * worked out here. Either way its transcript is mapped onto what is heard.
 */
export async function becomeCurrent(item: EpisodeItem, startAt: number | null, copy?: AudioCopy | null): Promise<void> {
  session.letGo.delete(item.id);
  void ensureTimeMap(item.id, copy === undefined ? rememberQueuedCopy(item) : copy);
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
 * Where an episode is started: a time in it, a moment of its transcript
 * (`time-map.ts`: moved to where it is heard once the copy to be played is
 * known), or null for where it was left.
 */
export type StartAt = number | { transcriptSec: number } | null;

/** Counts presses of play, so a slow start never overtakes the press after it. */
let startRun = 0;

/**
 * Plays an episode from where it was left (or from `startAt`), with the
 * episodes ahead queued behind it.
 */
export async function startEpisode(episodeId: string, startAt: StartAt = null): Promise<void> {
  const run = ++startRun;
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
  // The exact copy, for an episode whose transcript is mapped by copy: the
  // one the player streams is then the one mapped. Asked before anything is
  // tracked, and only the latest press carries on past it.
  // The queue behind it and the show's settings are read meanwhile; the show
  // decides where it starts: where it was left, or past the intro.
  const [{ streamUrl, copy }, upNext, show] = await Promise.all([copyToPlay(item), nativeUpNext(item.id), getShow(item.podcastId)]);
  if (run !== startRun) return;
  applyCommands("episode");
  // A transcript moment is moved to this copy's clock now that the copy is known.
  const start =
    startAt === null
      ? resumePosition(item, show?.skipIntroSec ?? 0)
      : typeof startAt === "number"
        ? startAt
        : transcriptToAudio(item.id, startAt.transcriptSec);
  // Tracked before the native queue changes, so the transition event that
  // loading fires is recognised as this episode rather than read as a skip.
  track(item, start);
  loadNativeQueue([mediaItemFrom(item, start, streamUrl), ...upNext]);
  await becomeCurrent(item, start, copy);
  TrackPlayer.play();
}

/**
 * After an episode ends on its own: the next one ahead, from the database
 * rather than the native queue, which only holds the first few.
 */
export async function advance(): Promise<void> {
  const [next] = await episodesAhead(null);
  if (next) await startEpisode(next.id);
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
 * Re-mirrors the episodes ahead into the native queue after they change, so the
 * lock screen's "next" and the end of the episode go where the listener expects.
 */
export async function syncNativeQueue(): Promise<void> {
  const current = selectEpisode(store());
  if (!store().loaded || !current) return;
  syncRun += 1;
  const run = syncRun;
  const upNext = await nativeUpNext(current.episodeId);
  // Read first and swapped in one go, so the queue is never empty behind the
  // episode, and only by the latest run: two at once would queue everything twice.
  if (run !== syncRun || !store().loaded || selectEpisode(store())?.episodeId !== current.episodeId) return;
  const active = TrackPlayer.getActiveMediaItemIndex() ?? 0;
  const length = TrackPlayer.getQueue().length;
  if (length > active + 1) TrackPlayer.removeMediaItems(active + 1, length);
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
