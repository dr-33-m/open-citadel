/**
 * What an episode's row says about copies of it, in one read: which copy its
 * download is, which copy its transcript was made from, and the maps from
 * that transcript onto the copies mapped. For `audio-copy.ts` and
 * `time-map.ts`, so a press of play reads the row once.
 *
 * A map is kept for each copy, the latest few: the copy streamed and the copy
 * downloaded are often two, and the player moves from one to the other when
 * the phone goes offline (`player/to-file.ts`), on the same moment of the show.
 */
import { eq } from 'drizzle-orm';
import { TimeMapSegmentSchema } from 'samwell-shared';
import { z } from 'zod';

import { db } from '@/db/client';
import { podcastEpisodes } from '@/db/schema';

export interface AudioCopy {
  /** The copy's own address, where the feed's redirects end. */
  url: string;
  /** Which copy it is (`audioIdentity`). */
  identity: string;
}

const AudioCopySchema = z.object({ url: z.string(), identity: z.string() });

/** A kept map: the copy it maps (`audioIdentity`) and its stretches. */
const StoredTimeMapSchema = z.object({ identity: z.string(), segments: z.array(TimeMapSegmentSchema) });
export type StoredTimeMap = z.infer<typeof StoredTimeMapSchema>;

/** Maps kept per episode, newest first: a copy streamed, a download, and a couple more. */
const KEPT_MAPS = 4;

export interface CopyRow {
  downloadCopy: AudioCopy | null;
  /** `TranscriptDoc.audio.identity`, when the transcript carries a fingerprint. */
  transcriptCopy: string | null;
  /** Newest first, one per copy. */
  timeMaps: StoredTimeMap[];
}

function parse<T>(schema: z.ZodType<T>, raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readCopyRow(episodeId: string): CopyRow {
  const row = db
    .select({ download: podcastEpisodes.downloadCopy, transcript: podcastEpisodes.transcriptCopy, map: podcastEpisodes.transcriptTimeMap })
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.id, episodeId))
    .get();
  return {
    downloadCopy: parse(AudioCopySchema, row?.download),
    transcriptCopy: row?.transcript ?? null,
    timeMaps: parse(z.array(StoredTimeMapSchema), row?.map) ?? [],
  };
}

/** Keeps a copy's map, in place of any older one for the same copy. */
export function saveTimeMap(episodeId: string, map: StoredTimeMap): void {
  const kept = readCopyRow(episodeId).timeMaps.filter((other) => other.identity !== map.identity);
  const maps = [map, ...kept].slice(0, KEPT_MAPS);
  db.update(podcastEpisodes).set({ transcriptTimeMap: JSON.stringify(maps) }).where(eq(podcastEpisodes.id, episodeId)).run();
}

/** The kept map for a copy, or null when that copy has not been mapped. */
export function mapOfCopy(row: CopyRow, identity: string): StoredTimeMap | null {
  return row.timeMaps.find((map) => map.identity === identity) ?? null;
}
