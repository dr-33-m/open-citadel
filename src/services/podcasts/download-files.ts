/** What a downloaded episode's file is called, and writing its download state. Addresses are `download-paths`. */
import { inArray } from "drizzle-orm";
import { getInfoAsync, makeDirectoryAsync } from "expo-file-system/legacy";

import { db } from "@/db/client";
import { podcastEpisodes } from "@/db/schema";
import { folderUri } from "@/services/podcasts/download-paths";
import { nowIso, type Episode } from "@/services/podcasts/records";

const EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "video/mp4": "mp4",
};

/** The file name for an episode: its id, and the extension its type or address implies. */
export function fileNameFor(episode: Pick<Episode, "id" | "audioUrl" | "mimeType">): string {
  const fromUrl = episode.audioUrl.split("?")[0].match(/\.([a-z0-9]{2,4})$/i)?.[1];
  const ext = (episode.mimeType && EXTENSIONS[episode.mimeType]) ?? fromUrl ?? "mp3";
  return `${episode.id}.${ext.toLowerCase()}`;
}

/** Writes an episode's download state. */
export async function setStatus(ids: string[], patch: Partial<Episode>): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(podcastEpisodes)
    .set({ ...patch, updatedAt: nowIso() })
    .where(inArray(podcastEpisodes.id, ids));
}

export async function ensureFolder(): Promise<void> {
  const info = await getInfoAsync(folderUri());
  if (!info.exists) await makeDirectoryAsync(folderUri(), { intermediates: true });
}
