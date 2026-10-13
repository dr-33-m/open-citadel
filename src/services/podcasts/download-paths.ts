/**
 * Where a downloaded episode's files are on this device, and so which picture
 * it is drawn with. Nothing here reads or writes anything: rows hold file
 * names, and these turn a name into an address at the moment of use, so
 * screens can call them as freely as any other formatting.
 */
import { documentDirectory } from "expo-file-system/legacy";

import type { Episode, EpisodeItem } from "@/services/podcasts/records";

const FOLDER = "podcasts/";

export function folderUri(): string {
  return `${documentDirectory}${FOLDER}`;
}

/** Where a downloaded episode's file is on this device, or null if it has none. */
export function localFileUri(episode: Pick<Episode, "downloadStatus" | "downloadFile">): string | null {
  if (episode.downloadStatus !== "downloaded" || !episode.downloadFile) return null;
  return `${folderUri()}${episode.downloadFile}`;
}

/** Where a downloaded episode's saved cover is on this device, or null if it has none. */
export function localCoverUri(episode: Pick<Episode, "downloadStatus" | "downloadCover">): string | null {
  if (episode.downloadStatus !== "downloaded" || !episode.downloadCover) return null;
  return `${folderUri()}${episode.downloadCover}`;
}

/**
 * The artwork an episode is drawn with, everywhere it is drawn: the copy saved
 * with its download when there is one, so it is there with no connection, then
 * its own picture, then its show's.
 */
export function episodeArtwork(
  item: Pick<EpisodeItem, "imageUrl" | "showImageUrl" | "downloadStatus" | "downloadCover">,
): string | null {
  return localCoverUri(item) ?? item.imageUrl ?? item.showImageUrl;
}
