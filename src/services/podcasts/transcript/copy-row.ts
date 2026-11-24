/**
 * What an episode's row says about copies of it, in one read: which copy its
 * download is, which copy its transcript was made from, and the map from that
 * transcript onto the copy last mapped. For `audio-copy.ts` and
 * `time-map.ts`, so a press of play reads the row once.
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

export interface CopyRow {
  downloadCopy: AudioCopy | null;
  /** `TranscriptDoc.audio.identity`, when the transcript carries a fingerprint. */
  transcriptCopy: string | null;
  timeMap: StoredTimeMap | null;
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
    timeMap: parse(StoredTimeMapSchema, row?.map),
  };
}

export function saveTimeMap(episodeId: string, map: StoredTimeMap): void {
  db.update(podcastEpisodes).set({ transcriptTimeMap: JSON.stringify(map) }).where(eq(podcastEpisodes.id, episodeId)).run();
}
