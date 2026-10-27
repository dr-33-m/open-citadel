/**
 * The native player's events, in the foreground and (on Android) from the
 * background task: saving progress, finishing and moving on, and catching up
 * with transitions the lock screen or a headset made without the app.
 */
import TrackPlayer, { Event, PlaybackState, type BackgroundEvent, type MediaItem } from "@rntp/player";

import { isBookItem } from "@/services/audiobook/media-id";
import { getEpisodeItem } from "@/services/podcasts/episodes";
import { advance, becomeCurrent, syncNativeQueue } from "@/services/podcasts/player/lifecycle";
import { nowPlayingFrom, speedFor } from "@/services/podcasts/player/media";
import { applyCommands } from "@/services/player/commands";
import { finishEpisode, persistProgress, ranToTheEnd, session, track } from "@/services/podcasts/player/session";
import { addPlayerHandler, readyPlayer } from "@/services/player/events";
import { store } from "@/services/player/session";
import { selectEpisode } from "@/stores/player";
import { getShow } from "@/services/podcasts/shows";
import { podcastPrefs, usePodcastPrefs } from "@/stores/podcast-prefs";
import { invalidatePodcastLibrary } from "@/query-manager/podcasts/invalidate";

/** Past the artwork's step back on pause (`motion.slow`), with room to spare. */
const PAUSE_SETTLE_MS = 450;

async function onTransition(item: MediaItem | null): Promise<void> {
  const previous = session.tracking;
  if (!item?.mediaId || item.mediaId === previous?.episodeId || isBookItem(item.mediaId)) return;
  if (previous) {
    if (ranToTheEnd(previous)) await finishEpisode(previous.episodeId);
    session.tracking = null;
  }
  const next = await getEpisodeItem(item.mediaId);
  if (!next) return;
  await becomeCurrent(next, null);
  // Keep the native queue topped up from Up Next as it is consumed.
  await syncNativeQueue();
}

/**
 * Takes up an episode the native player is playing that this runtime is not
 * tracking: on Android the JS runtime can be started fresh by a background
 * event while audio carried on, with every in-memory value gone. Without this
 * its position would silently stop being saved.
 */
async function adopt(mediaId: string): Promise<boolean> {
  if (session.letGo.has(mediaId) || isBookItem(mediaId)) return false;
  const item = await getEpisodeItem(mediaId);
  if (!item || item.playState === "played") return false;
  const show = await getShow(item.podcastId);
  track(item, item.positionSec, show?.skipEndingSec ?? 0);
  store().patch({ current: nowPlayingFrom(item), loaded: true });
  return true;
}

/** Finishes the tracked episode and moves on. Lets go first, so no later tick writes a position back onto it. */
async function finishTrackedAndAdvance(episodeId: string): Promise<void> {
  session.tracking = null;
  await finishEpisode(episodeId);
  await advance();
}

async function handleEvent(event: BackgroundEvent): Promise<void> {
  switch (event.type) {
    case Event.PlaybackProgressUpdated: {
      if (!session.tracking) {
        if (!(await adopt(event.mediaId))) return;
      } else if (session.tracking.episodeId !== event.mediaId) {
        return;
      }
      await persistProgress(event.position, event.duration);
      // Skip the ending: the rest of this episode is outro the listener asked not to hear.
      const t = session.tracking;
      if (t && t.skipEndingSec > 0 && event.duration > 0 && event.duration - event.position <= t.skipEndingSec) {
        await finishTrackedAndAdvance(t.episodeId);
      }
      return;
    }
    case Event.IsPlayingChanged: {
      if (!event.playing) {
        await persistProgress();
        // After the pause has finished animating (the player's artwork steps
        // back over `motion.slow`): every podcast list re-reads on this, and
        // those re-renders landing inside the animation made it jump.
        setTimeout(invalidatePodcastLibrary, PAUSE_SETTLE_MS);
      } else if (session.tracking) {
        session.tracking.lastTickAt = Date.now();
      }
      return;
    }
    case Event.PlaybackStateChanged: {
      if (event.state === PlaybackState.Ended && session.tracking) {
        await finishTrackedAndAdvance(session.tracking.episodeId);
      }
      return;
    }
    case Event.MediaItemTransition:
      await onTransition(event.item);
      return;
    case Event.PlaybackError:
      if (selectEpisode(store())) {
        store().patch({ error: "This episode could not be played. Check your connection, or download it first." });
      }
      return;
    default:
      return;
  }
}

addPlayerHandler('episode', handleEvent);

/**
 * Puts the last episode back in the mini player after a restart, paused and
 * not yet loaded (loading is deferred to the first press, so launch pays
 * nothing for it). If the native player is in fact still playing it (the app
 * was reloaded while audio carried on), takes it back up as it is.
 */
export async function restoreNowPlaying(): Promise<void> {
  const episodeId = podcastPrefs().nowPlayingEpisodeId;
  if (!episodeId) return;
  const item = await getEpisodeItem(episodeId);
  if (!item) {
    usePodcastPrefs.getState().set("nowPlayingEpisodeId", null);
    return;
  }
  // Android only: the player is set up at launch there (for read-aloud), so it
  // can be asked what it holds. On iOS it is set up on first play, and asking
  // an unset player is not safe.
  let active: MediaItem | null = null;
  if (process.env.EXPO_OS === "android") {
    try {
      active = TrackPlayer.getActiveMediaItem();
    } catch {
      active = null;
    }
  }
  if (active?.mediaId === item.id && readyPlayer()) {
    // Setting the player up again (above) knows nothing of the lock screen's
    // controls, and nothing else says them again for an episode already playing.
    applyCommands("episode");
    track(item, TrackPlayer.getProgress().position);
    store().patch({
      current: nowPlayingFrom(item),
      loaded: true,
      isPlaying: TrackPlayer.isPlaying(),
      speed: await speedFor(item.podcastId),
    });
    return;
  }
  store().patch({ current: nowPlayingFrom(item), loaded: false, speed: await speedFor(item.podcastId) });
}
