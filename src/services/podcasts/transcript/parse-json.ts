/**
 * The Podcast Namespace's JSON transcript: `{ version, segments: [{ speaker,
 * startTime, endTime, body }] }`, often one word per segment. Pure.
 */
import type { TranscriptDoc } from 'samwell-shared';

import { docFromPieces, type Piece } from '@/services/podcasts/transcript/cues';

type JsonSegment = { speaker?: unknown; startTime?: unknown; endTime?: unknown; body?: unknown };

const seconds = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function parseJsonTranscript(body: string): TranscriptDoc | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const segments = (parsed as { segments?: unknown })?.segments;
  if (!Array.isArray(segments)) return null;
  const pieces: Piece[] = (segments as JsonSegment[]).map((segment) => ({
    start: seconds(segment.startTime),
    end: seconds(segment.endTime),
    speaker: typeof segment.speaker === 'string' ? segment.speaker : null,
    text: typeof segment.body === 'string' ? segment.body : '',
  }));
  const doc = docFromPieces(pieces);
  return doc.segments.length > 0 ? doc : null;
}
