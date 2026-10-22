/**
 * Everything a listener can do, as the screens call it.
 *
 * Each action is the database change plus whatever has to follow it, in one
 * place: a change to Up Next is mirrored into the native player so the lock
 * screen agrees, marking the playing episode played moves the player on, and
 * every change tells the library to re-read. A screen calling one of these
 * cannot forget half of it, which is the whole reason they are not inlined at
 * each call site.
 */
import { deleteDownloads, deleteIfPlayed, deleteShowDownloads, downloadEpisodes, autoDownload } from "@/services/podcasts/downloads";
import * as episodeState from "@/services/podcasts/episode-state";
import * as queue from "@/services/podcasts/queue";
import { appleIdFromLink, resolveFeedUrl, type DiscoveredShow } from "@/services/podcasts/discovery";
import { fetchFeedEarly, normalizeFeedUrl } from "@/services/feeds/fetch";
import { addShowFromFeed, refreshShow } from "@/services/podcasts/feed-sync";
import { finishCurrentAndAdvance, stopPlayback, syncNativeQueue } from "@/services/podcasts/player";
import * as shows from "@/services/podcasts/shows";
import { selectEpisode, selectEpisodeId, usePlayer } from "@/stores/player";
import { invalidatePodcastLibrary } from "@/query-manager/podcasts/invalidate";

/** Older than this, a show opened from Explore is refreshed as it opens. */
const STALE_ON_OPEN_MS = 60 * 60 * 1000;

async function afterQueueChange(): Promise<void> {
  await syncNativeQueue();
  invalidatePodcastLibrary();
}

export async function setFavorite(ids: string[], favorite: boolean): Promise<void> {
  await episodeState.setFavorite(ids, favorite);
  invalidatePodcastLibrary();
}

export async function markPlayed(ids: string[], played: boolean): Promise<void> {
  const current = selectEpisodeId(usePlayer.getState());
  const inPlayer = played && current != null && ids.includes(current);
  const rest = inPlayer ? ids.filter((id) => id !== current) : ids;
  await episodeState.setPlayed(rest, played);
  if (played) {
    for (const id of rest) await deleteIfPlayed(id);
  }
  // Done with the one in the player: the player finishes it and moves on,
  // as the end of the audio would.
  if (inPlayer) await finishCurrentAndAdvance();
  await afterQueueChange();
}

export async function markSeen(ids: string[] | "all"): Promise<void> {
  await episodeState.markSeen(ids);
  invalidatePodcastLibrary();
}

export async function resetPosition(ids: string[]): Promise<void> {
  await episodeState.resetPosition(ids);
  invalidatePodcastLibrary();
}

export async function markShowSeen(showId: string): Promise<void> {
  await episodeState.markShowSeen(showId);
  invalidatePodcastLibrary();
}

export async function addToQueue(ids: string[], where: "next" | "last"): Promise<void> {
  const current = selectEpisodeId(usePlayer.getState());
  await queue.enqueue(
    ids.filter((id) => id !== current),
    where,
  );
  await afterQueueChange();
}

export async function removeFromQueue(ids: string[]): Promise<void> {
  await queue.dequeue(ids);
  await afterQueueChange();
}

export async function moveInQueue(id: string, toIndex: number): Promise<void> {
  await queue.moveInQueue(id, toIndex);
  await afterQueueChange();
}

export async function clearQueue(): Promise<void> {
  await queue.clearQueue();
  await afterQueueChange();
}

/** Returns the ids actually queued: anything already on its way is left alone. */
export async function download(ids: string[]): Promise<string[]> {
  return downloadEpisodes(ids);
}

export async function removeDownload(ids: string[]): Promise<void> {
  await deleteDownloads(ids);
}

// ── Shows ───────────────────────────────────────────────────────────────────

export async function subscribe(showId: string): Promise<void> {
  await shows.subscribe(showId);
  invalidatePodcastLibrary();
}

/**
 * Leaves a show: its downloads, episodes and progress go, and so does the
 * episode in the player if it was one of them.
 */
export async function unsubscribe(showId: string): Promise<void> {
  if (selectEpisode(usePlayer.getState())?.podcastId === showId) await stopPlayback();
  await deleteShowDownloads(showId);
  await shows.deleteShow(showId);
  await afterQueueChange();
}

export async function updateShowSettings(showId: string, patch: Partial<shows.ShowSettings>): Promise<void> {
  await shows.updateShowSettings(showId, patch);
  invalidatePodcastLibrary();
}

/** Refreshes one show now, ignoring the interval (the show page's pull). */
export async function refreshShowNow(showId: string): Promise<string | null> {
  const show = await shows.getShow(showId);
  if (!show) return null;
  const outcome = await refreshShow(show, true);
  await autoDownload(outcome.freshIds);
  invalidatePodcastLibrary();
  return outcome.error;
}

/**
 * Starts the download behind `openDiscoveredShow` at the tap that opens the
 * show, so its page, which waits to land before storing the feed, finds the
 * feed already here rather than starting a round trip then. Nothing for a
 * show already stored: that opens from the database.
 */
export function prefetchDiscoveredShow(show: Pick<DiscoveredShow, "appleId" | "feedUrl">): void {
  resolveFeedUrl(show)
    .then(async (feedUrl) => {
      if (!(await shows.findShowByFeedUrl(feedUrl))) fetchFeedEarly(feedUrl);
    })
    .catch(() => {});
}

/**
 * Opens a show found in Explore: fetches its feed and stores it as a preview,
 * so its page and episodes are real and playable before anyone commits to
 * following it. Returns the stored show's id.
 */
export async function openDiscoveredShow(show: Pick<DiscoveredShow, "appleId" | "feedUrl">): Promise<string> {
  const feedUrl = await resolveFeedUrl(show);
  // No library invalidation: a preview is in no list (every shelf, the
  // Podcasts page and Explore's "Following" draw followed shows, or episodes
  // someone has played, queued or kept), and the page asks for its own rows.
  // Re-reading every list on screen here landed just as the page did, and
  // stalled the slide back out to Explore.
  const stored = await addShowFromFeed(feedUrl, "preview");
  // A show seen before (a preview kept from last week, or one followed) may be
  // behind its feed: bring it up to date behind the page that is opening.
  const age = stored.lastRefreshAt ? Date.now() - Date.parse(stored.lastRefreshAt) : Infinity;
  if (age > STALE_ON_OPEN_MS) {
    void refreshShow(stored).then(() => invalidatePodcastLibrary());
  }
  return stored.id;
}

/**
 * Follows a show found in the directory without opening it first: Samwell
 * following shows during onboarding, where the reader chose from his picks
 * rather than from the show's page.
 */
export async function followDiscoveredShow(show: Pick<DiscoveredShow, "appleId" | "feedUrl">): Promise<void> {
  await addShowFromFeed(await resolveFeedUrl(show), "subscribed");
  invalidatePodcastLibrary();
}

/** The same, for a feed address or an Apple Podcasts link someone pasted. */
export async function openPastedShow(input: string): Promise<string> {
  const appleId = appleIdFromLink(input);
  return openDiscoveredShow(appleId ? { appleId, feedUrl: null } : { appleId: null, feedUrl: normalizeFeedUrl(input) });
}

/** One-episode forms of the download actions, stable for list rows' memo. */
export const downloadOne = (episodeId: string): void => void download([episodeId]);
export const removeDownloadOne = (episodeId: string): void => void removeDownload([episodeId]);
