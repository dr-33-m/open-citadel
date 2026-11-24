/**
 * The map between a transcript's clock and the clock of the copy of the
 * episode being played.
 *
 * Shows that stitch ads into each download give every listener a different
 * copy: the show is the same, the ads around it are not, so a transcript made
 * from one copy runs early or late on another by however much ad time differs
 * before each moment. The server compares the two copies' sound and answers
 * the stretches they share (`TimeMapSegment`); everything here converts a time
 * across that map. A transcript's own times, and the highlights kept on it,
 * are never rewritten: they stay in the transcript's clock, and are converted
 * as they are shown, followed or played from.
 *
 * Pure, so it can be tested on its own.
 */
import { z } from 'zod';

/**
 * A stretch the two copies share: playing-copy seconds `audioStart` to
 * `audioEnd`, starting at `transcriptStart` in the transcript. One schema for
 * the server's answer and the map a phone keeps.
 */
export const TimeMapSegmentSchema = z
  .object({ audioStart: z.number().min(0), audioEnd: z.number().min(0), transcriptStart: z.number().min(0) })
  .refine((segment) => segment.audioEnd > segment.audioStart);

export type TimeMapSegment = z.infer<typeof TimeMapSegmentSchema>;

/** A map, in playing order. Empty means nothing was matched, and the clocks are taken as the same. */
export type TimeMap = readonly TimeMapSegment[];

export const EMPTY_TIME_MAP: TimeMap = [];

/** What the server answers a request to map a copy. */
export const TimeMapAnswerSchema = z.object({ segments: z.array(TimeMapSegmentSchema) });

/** The segment's end on the transcript's clock. */
function transcriptEnd(segment: TimeMapSegment): number {
  return segment.transcriptStart + (segment.audioEnd - segment.audioStart);
}

/**
 * Where a moment of the transcript is heard in the playing copy.
 *
 * A moment the playing copy does not have (an ad that was in the transcribed
 * copy only) is heard where the show picks up again after it. With no map,
 * the time is its own.
 */
export function toAudioTime(map: TimeMap, transcriptSec: number): number {
  if (map.length === 0) return transcriptSec;
  let after: TimeMapSegment | null = null;
  for (const segment of map) {
    if (transcriptSec >= segment.transcriptStart && transcriptSec < transcriptEnd(segment)) {
      return segment.audioStart + (transcriptSec - segment.transcriptStart);
    }
    if (segment.transcriptStart > transcriptSec && (!after || segment.transcriptStart < after.transcriptStart)) after = segment;
  }
  if (after) return after.audioStart;
  // Past the last stretch: carried on from the stretch nearest before it.
  const last = map.reduce((a, b) => (transcriptEnd(b) > transcriptEnd(a) ? b : a));
  return last.audioEnd + (transcriptSec - transcriptEnd(last));
}

/**
 * Which moment of the transcript is being heard at a time of the playing
 * copy, or null in an ad the transcript does not have.
 */
export function toTranscriptTime(map: TimeMap, audioSec: number): number | null {
  if (map.length === 0) return audioSec;
  for (const segment of map) {
    if (audioSec >= segment.audioStart && audioSec < segment.audioEnd) {
      return segment.transcriptStart + (audioSec - segment.audioStart);
    }
  }
  return null;
}

/**
 * The same moment of the show in another copy: from a time in the copy
 * mapped by `from`, through the transcript's clock, to the copy mapped by
 * `to`. Inside an ad only the first copy has, the moment is where the show
 * picks up after it.
 */
export function carryAcross(from: TimeMap, to: TimeMap, audioSec: number): number {
  const heard = toTranscriptTime(from, audioSec);
  if (heard !== null) return toAudioTime(to, heard);
  const resumes = from.filter((segment) => segment.audioStart > audioSec).sort((a, b) => a.audioStart - b.audioStart)[0];
  if (resumes) return toAudioTime(to, resumes.transcriptStart);
  // An ad after the last stretch: the show is over, so where it ends in the other copy.
  const showEnds = Math.max(...from.map(transcriptEnd));
  return toAudioTime(to, showEnds);
}

/**
 * Which copy of an episode a file is: where it was finally served from and
 * how long it is. An ad server names each stitched copy by its own address,
 * and a different set of ads all but always changes the length, so two
 * copies with the same identity are the same sound. The query is left out:
 * it carries session and tracking values that change on every request.
 */
export function audioIdentity(finalUrl: string, totalBytes: number | null): string {
  const bare = finalUrl.split('#')[0]!.split('?')[0]!;
  return `${bare}|${totalBytes ?? '?'}`;
}

/** The length a ranged reply gives for the whole file: "bytes 0-0/77457297". */
export function totalBytesOf(contentRange: string | null, contentLength: string | null): number | null {
  const whole = contentRange?.match(/\/(\d+)\s*$/);
  if (whole) return Number(whole[1]);
  // A host that ignores the range sends the whole file, and says how long it is.
  const length = contentLength ? Number(contentLength) : NaN;
  return Number.isFinite(length) && length > 1 ? length : null;
}

