/**
 * An episode's transcript on the clock of the copy being played.
 *
 * A transcript Scribe made carries the fingerprint of the copy it was made
 * from. When the copy this phone plays (`audio-copy.ts`) is another, the
 * server maps it onto the transcript by sound, once, and the map is kept on
 * the episode's row, so a copy is never mapped twice. The transcript's times,
 * and the highlights kept on it, stay in its own clock and are never
 * rewritten: everything that meets the player converts as it goes, through
 * the two functions here.
 *
 * Without a fingerprint (a transcript from before, or a show's own), a map
 * yet, or a known copy, the clocks are taken as the same, as they always were.
 */
import { EMPTY_TIME_MAP, toAudioTime, toTranscriptTime, type TimeMap } from 'samwell-shared';

import { phoneHasNetwork } from '@/lib/network';
import { queryClient } from '@/lib/query-client';
import { reportHandled } from '@/lib/observe';
import { transcriptKeys } from '@/query-manager/transcripts/keys';
import { playedCopy } from '@/services/podcasts/transcript/audio-copy';
import { mapAudioCopy } from '@/services/podcasts/transcript/cloud';
import { mapOfCopy, readCopyRow, saveTimeMap, type AudioCopy } from '@/services/podcasts/transcript/copy-row';
import { readFingerprint } from '@/services/podcasts/transcript/store';

/** Copies being mapped now (`episodeId identity`), so a second play does not ask again. */
const mapping = new Set<string>();
const mappingKey = (episodeId: string, identity: string) => `${episodeId} ${identity}`;

/**
 * The map for the copy of `episodeId` being played: the one kept for that
 * copy. Not played this session, the copy it most likely will be stands in
 * (its download, else the copy last mapped), for reading before pressing
 * play. Played with the copy not known, none: better the transcript's own
 * clock than one moved by a map made for some other copy.
 *
 * Read from the row each time, which is cheap: it is read when it changes and
 * on a tap, never on the player's tick.
 */
export function timeMapFor(episodeId: string): TimeMap {
  const row = readCopyRow(episodeId);
  const copy = playedCopy(episodeId);
  if (copy === undefined) {
    const likely = row.downloadCopy ? mapOfCopy(row, row.downloadCopy.identity) : (row.timeMaps[0] ?? null);
    return likely?.segments ?? EMPTY_TIME_MAP;
  }
  return (copy && mapOfCopy(row, copy.identity)?.segments) || EMPTY_TIME_MAP;
}

/**
 * A copy's map when it is known: empty for the very copy transcribed, null
 * for a transcript with no fingerprint or a copy not mapped yet. For moving
 * the same moment from one copy to another (`player/to-file.ts`).
 */
export function knownMapOf(episodeId: string, copy: AudioCopy): TimeMap | null {
  const row = readCopyRow(episodeId);
  if (!row.transcriptCopy) return null;
  if (row.transcriptCopy === copy.identity) return EMPTY_TIME_MAP;
  return mapOfCopy(row, copy.identity)?.segments ?? null;
}

/** Where a moment of the transcript is heard in the copy being played. */
export function transcriptToAudio(episodeId: string, transcriptSec: number): number {
  return toAudioTime(timeMapFor(episodeId), transcriptSec);
}

/** Which moment of the transcript is being heard, or null in an ad the transcript does not have. */
export function audioToTranscript(episodeId: string, audioSec: number): number | null {
  return toTranscriptTime(timeMapFor(episodeId), audioSec);
}

/**
 * The copy being played has just been given to the player: makes sure it is
 * mapped onto the episode's transcript. Nothing to do for a transcript with
 * no fingerprint, the very copy transcribed, or a copy mapped before;
 * otherwise the server is asked, in the background, while it plays.
 */
export async function ensureTimeMap(episodeId: string, copy: AudioCopy | null): Promise<void> {
  // The copy given to the player decides which map the transcript reads.
  announce(episodeId);
  if (!copy) return;
  const key = mappingKey(episodeId, copy.identity);
  if (mapping.has(key)) return;
  const row = readCopyRow(episodeId);
  if (!row.transcriptCopy || mapOfCopy(row, copy.identity)) return;
  if (row.transcriptCopy === copy.identity) {
    saveTimeMap(episodeId, { identity: copy.identity, segments: [] });
    announce(episodeId);
    return;
  }
  // Offline the server cannot be asked: it is, the next time this copy plays online.
  if (!phoneHasNetwork()) return;
  mapping.add(key);
  announce(episodeId);
  try {
    const fingerprint = await readFingerprint(episodeId);
    if (!fingerprint) return;
    saveTimeMap(episodeId, { identity: copy.identity, segments: await mapAudioCopy(copy.url, fingerprint) });
  } catch (error) {
    // Played on the transcript's own clock, as before, and asked again next time.
    reportHandled('transcript.time_map', error);
  } finally {
    mapping.delete(key);
    announce(episodeId);
  }
}

/** The transcript sheet reads the map and whether one is being made, so it redraws on both. */
function announce(episodeId: string): void {
  void queryClient.invalidateQueries({ queryKey: transcriptKeys.timeMap(episodeId) });
}

export interface TimeMapState {
  segments: TimeMap;
  /** The copy being played is being mapped: the transcript would not yet follow it. */
  syncing: boolean;
}

export function timeMapState(episodeId: string): TimeMapState {
  // Only the copy being heard: a download mapped meanwhile leaves the stream in step.
  const copy = playedCopy(episodeId);
  return { segments: timeMapFor(episodeId), syncing: copy ? mapping.has(mappingKey(episodeId, copy.identity)) : false };
}
