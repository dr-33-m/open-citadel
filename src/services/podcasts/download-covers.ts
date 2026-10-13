/**
 * The covers of downloaded episodes, kept beside their audio.
 *
 * A picture drawn from the network lives only in the image cache, which the
 * system empties when it likes, so an episode downloaded for a flight could
 * play there with a blank square. A download therefore takes its cover with
 * it: the file sits in the podcast folder and the row names it (see
 * `podcast_episodes.download_cover`).
 *
 * The file is named after the picture's address, not the episode, because most
 * of a show's episodes use the show's one picture and thirty copies of it would
 * be thirty times the space. So a cover belongs to every row that names it, and
 * is removed only when the last of them lets go.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createDownloadResumable, deleteAsync, getInfoAsync, moveAsync } from "expo-file-system/legacy";

import { db } from "@/db/client";
import { podcastEpisodes, podcasts } from "@/db/schema";
import { ensureFolder, setStatus } from "@/services/podcasts/download-files";
import { episodeArtwork, folderUri } from "@/services/podcasts/download-paths";
import { getEpisodeItem } from "@/services/podcasts/episodes";
import { usePodcastPlayer } from "@/stores/podcast-player";
import { invalidatePodcastLibrary } from "@/query-manager/podcasts/invalidate";

/** A cover is small; one that has not arrived by now is not coming on this connection. */
const TIMEOUT_MS = 20_000;

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

/** Two unrelated 32-bit hashes side by side: one alone is too few bits to name files by. */
function addressKey(url: string): string {
  let a = 5381;
  let b = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    a = (((a << 5) + a) ^ c) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** The file a picture at `url` is saved as: the same name for the same address, always. */
export function coverNameFor(url: string): string {
  const fromUrl = url.split(/[?#]/)[0].match(/\.([a-z0-9]{3,4})$/i)?.[1]?.toLowerCase();
  const ext = fromUrl && IMAGE_EXTENSIONS.has(fromUrl) ? fromUrl : "jpg";
  return `cover-${addressKey(url)}.${ext}`;
}

/** Whether a response says it is text (a page) rather than a picture. Header names differ by platform. */
function isText(headers: Record<string, string> | undefined): boolean {
  const key = Object.keys(headers ?? {}).find((k) => k.toLowerCase() === "content-type");
  return !!key && /^text\//i.test(headers![key].trim());
}

/** Fetches still under way, by file name, so two episodes of a show do not both write its cover. */
const fetching = new Map<string, Promise<boolean>>();
/** Covers about to be written into a row, which `dropUnusedCovers` must leave alone meanwhile. */
const held = new Map<string, number>();

async function fetchCover(url: string, name: string): Promise<boolean> {
  const target = `${folderUri()}${name}`;
  // Written under another name and moved into place whole: a fetch the app was
  // closed in the middle of must not leave half a picture that looks finished.
  const part = `${target}.part`;
  try {
    await ensureFolder();
    const existing = await getInfoAsync(target);
    if (existing.exists) return true;
    const task = createDownloadResumable(url, part);
    const timer = setTimeout(() => void task.cancelAsync().catch(() => {}), TIMEOUT_MS);
    const result = await task.downloadAsync().finally(() => clearTimeout(timer));
    if (!result || result.status < 200 || result.status >= 300) throw new Error("No cover.");
    // A sign-in page or an error page answers 200 as well, and saved as the
    // cover it would draw as a blank square from then on.
    if (isText(result.headers)) throw new Error("Not a picture.");
    await moveAsync({ from: part, to: target });
    return true;
  } catch {
    await deleteAsync(part, { idempotent: true }).catch(() => {});
    return false;
  }
}

/**
 * Saves the picture at `url` and hands its file name to `record`, which writes
 * it into whichever rows it is for. Null when there is no picture or it could
 * not be fetched: a download is still a download without its cover, and
 * `saveMissingCovers` asks again on a later launch.
 */
export async function withSavedCover(url: string | null, record: (name: string | null) => Promise<void>): Promise<void> {
  if (!url) return record(null);
  const name = coverNameFor(url);
  held.set(name, (held.get(name) ?? 0) + 1);
  try {
    let fetch = fetching.get(name);
    if (!fetch) {
      fetch = fetchCover(url, name).finally(() => fetching.delete(name));
      fetching.set(name, fetch);
    }
    await record((await fetch) ? name : null);
  } finally {
    const left = (held.get(name) ?? 1) - 1;
    if (left > 0) held.set(name, left);
    else held.delete(name);
  }
}

/**
 * Gives the player the right picture again after the saved cover of one of
 * `ids` came or went. The player keeps the address it was handed when the
 * episode loaded, and that address is the saved file when there is one: delete
 * the download of what is playing and it would be left drawing a file that is
 * gone.
 */
export async function refreshPlayingCover(ids: string[]): Promise<void> {
  const playing = usePodcastPlayer.getState().current;
  if (!playing || !ids.includes(playing.episodeId)) return;
  const item = await getEpisodeItem(playing.episodeId);
  const current = usePodcastPlayer.getState().current;
  if (!item || current?.episodeId !== item.id) return;
  const artworkUrl = episodeArtwork(item);
  if (artworkUrl !== current.artworkUrl) usePodcastPlayer.getState().patch({ current: { ...current, artworkUrl } });
}

/** Removes the covers among `names` that no row names any more. */
export async function dropUnusedCovers(names: (string | null)[]): Promise<void> {
  const candidates = [...new Set(names.filter((n): n is string => !!n && !held.has(n)))];
  if (candidates.length === 0) return;
  const rows = await db
    .selectDistinct({ name: podcastEpisodes.downloadCover })
    .from(podcastEpisodes)
    .where(inArray(podcastEpisodes.downloadCover, candidates));
  const used = new Set(rows.map((r) => r.name));
  await Promise.all(
    candidates
      .filter((name) => !used.has(name))
      .map((name) => deleteAsync(`${folderUri()}${name}`, { idempotent: true }).catch(() => {})),
  );
}

/**
 * Fetches the cover of every downloaded episode that has none: those
 * downloaded before covers were saved, and those whose cover could not be
 * reached at the time. One fetch per picture, one after another.
 */
export async function saveMissingCovers(): Promise<void> {
  const rows = await db
    .select({ id: podcastEpisodes.id, imageUrl: podcastEpisodes.imageUrl, showImageUrl: podcasts.imageUrl })
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(and(eq(podcastEpisodes.downloadStatus, "downloaded"), isNull(podcastEpisodes.downloadCover)));
  const byUrl = new Map<string, string[]>();
  for (const row of rows) {
    const url = row.imageUrl ?? row.showImageUrl;
    if (url) byUrl.set(url, [...(byUrl.get(url) ?? []), row.id]);
  }
  let saved = false;
  for (const [url, ids] of byUrl) {
    await withSavedCover(url, async (name) => {
      if (!name) return;
      // Only those still on the device: one may have been deleted while this ran.
      const kept = await db
        .select({ id: podcastEpisodes.id })
        .from(podcastEpisodes)
        .where(and(inArray(podcastEpisodes.id, ids), eq(podcastEpisodes.downloadStatus, "downloaded")));
      await setStatus(kept.map((r) => r.id), { downloadCover: name });
      await refreshPlayingCover(ids);
      saved = saved || kept.length > 0;
    });
    await dropUnusedCovers([coverNameFor(url)]);
  }
  if (saved) invalidatePodcastLibrary();
}
