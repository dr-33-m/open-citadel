/**
 * Episode downloads: what is on the device, and the rules for fetching and
 * removing it. The queue itself is `download-queue`; files are `download-files`,
 * their addresses `download-paths`, and the covers saved with them `download-covers`.
 *
 * Files live in the app's own `podcasts/` folder under a name derived from the
 * episode id. Rows store only that name (see `podcast_episodes.download_file`)
 * and the path is rebuilt here on every use, so the iOS container moving
 * between launches cannot strand a download the way it once stranded books.
 *
 * The rules around downloads are AntennaPod's: an episode whose download was
 * deleted is not fetched again by auto-download, and a played episode's file
 * can be removed on its own when the listener asked for that.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { deleteAsync } from "expo-file-system/legacy";

import { db } from "@/db/client";
import { podcastEpisodes, podcasts } from "@/db/schema";
import { dropUnusedCovers, refreshPlayingCover } from "@/services/podcasts/download-covers";
import { fileNameFor, setStatus } from "@/services/podcasts/download-files";
import { folderUri } from "@/services/podcasts/download-paths";
import { cancelDownloads, isPending, startDownloads } from "@/services/podcasts/download-queue";
import { podcastPrefs } from "@/stores/podcast-prefs";
import { invalidatePodcastLibrary } from "@/query-manager/podcasts/invalidate";

/**
 * Queues episodes for download. Anything already downloaded or on its way is
 * left alone. Returns the ids actually queued.
 */
export async function downloadEpisodes(ids: string[]): Promise<string[]> {
  const rows = await db
    .select({ id: podcastEpisodes.id, status: podcastEpisodes.downloadStatus })
    .from(podcastEpisodes)
    .where(inArray(podcastEpisodes.id, ids));
  const todo = rows
    .filter((r) => r.status === "none" || r.status === "failed")
    .map((r) => r.id)
    .filter((id) => !isPending(id));
  if (todo.length === 0) return [];
  await setStatus(todo, { downloadStatus: "queued", downloadError: null, autoDownloadEligible: 1 });
  invalidatePodcastLibrary();
  startDownloads(todo);
  return todo;
}

/**
 * Removes downloaded (or half-downloaded) files and forgets them. Marked so
 * auto-download will not fetch them again: deleting a download is the
 * listener saying they do not want it on the device.
 */
export async function deleteDownloads(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await cancelDownloads(ids);
  const rows = await db
    .select({
      id: podcastEpisodes.id,
      downloadFile: podcastEpisodes.downloadFile,
      downloadCover: podcastEpisodes.downloadCover,
      audioUrl: podcastEpisodes.audioUrl,
      mimeType: podcastEpisodes.mimeType,
    })
    .from(podcastEpisodes)
    .where(inArray(podcastEpisodes.id, ids));
  await Promise.all(
    rows.map((r) =>
      deleteAsync(`${folderUri()}${r.downloadFile ?? fileNameFor(r)}`, { idempotent: true }).catch(() => {}),
    ),
  );
  await setStatus(ids, {
    downloadStatus: "none",
    downloadFile: null,
    downloadCover: null,
    downloadedAt: null,
    downloadError: null,
    autoDownloadEligible: 0,
  });
  // The player first, so it is never left holding a file that is about to go.
  await refreshPlayingCover(ids);
  await dropUnusedCovers(rows.map((r) => r.downloadCover));
  invalidatePodcastLibrary();
}

/** Every file a show has on the device, before the show itself is removed. */
export async function deleteShowDownloads(podcastId: string): Promise<void> {
  const rows = await db
    .select({ id: podcastEpisodes.id })
    .from(podcastEpisodes)
    .where(and(eq(podcastEpisodes.podcastId, podcastId), sql`${podcastEpisodes.downloadStatus} != 'none'`));
  await deleteDownloads(rows.map((r) => r.id));
}

/**
 * Fetches newly published episodes for the shows that want them, per the
 * show's own switch or, where it follows the global one, that.
 */
export async function autoDownload(episodeIds: string[]): Promise<void> {
  if (episodeIds.length === 0) return;
  const globalOn = podcastPrefs().autoDownload;
  const rows = await db
    .select({ id: podcastEpisodes.id, setting: podcasts.autoDownload, eligible: podcastEpisodes.autoDownloadEligible })
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(inArray(podcastEpisodes.id, episodeIds));
  const wanted = rows
    .filter((r) => r.eligible === 1 && (r.setting === "on" || (r.setting === "global" && globalOn)))
    .map((r) => r.id);
  await downloadEpisodes(wanted);
}

/** After an episode is played to the end: drop its file if the listener asked for that. */
export async function deleteIfPlayed(episodeId: string): Promise<void> {
  const rows = await db
    .select({ setting: podcasts.autoDelete, status: podcastEpisodes.downloadStatus, favorite: podcastEpisodes.isFavorite })
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(eq(podcastEpisodes.id, episodeId))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "downloaded" || row.favorite === 1) return;
  const on = row.setting === "on" || (row.setting === "global" && podcastPrefs().autoDeletePlayed);
  if (on) await deleteDownloads([episodeId]);
}

/**
 * Picks up where the last run left off: anything that was queued or mid-way
 * when the app was closed starts again from the beginning.
 */
export async function resumeInterruptedDownloads(): Promise<void> {
  const rows = await db
    .select({ id: podcastEpisodes.id })
    .from(podcastEpisodes)
    .where(inArray(podcastEpisodes.downloadStatus, ["queued", "downloading"]));
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  await setStatus(ids, { downloadStatus: "none" });
  await downloadEpisodes(ids);
}

/** Bytes on disk across every downloaded episode. */
export async function downloadedBytes(): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${podcastEpisodes.fileSize}), 0)`.mapWith(Number) })
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.downloadStatus, "downloaded"));
  return rows[0]?.total ?? 0;
}
