/**
 * Following a transcript: whether it has times, the line being spoken, the
 * search count, and the passage a long press hands Samwell. Pure. The lines
 * themselves are `transcript-lines`.
 */
import type { TranscriptDoc } from 'samwell-shared';

import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { segmentLine } from '@/services/podcasts/transcript/episode-prompt';

/** Whether a transcript has times to follow the audio by. Plain-text ones do not. */
export function isTimed(doc: Pick<TranscriptDoc, 'segments'>): boolean {
  return doc.segments.some((segment) => segment.end > 0);
}

/**
 * The line being spoken: the last whose start is at or before the position.
 * A binary search, so a two hour transcript costs a dozen steps a tick.
 * -1 before the first line.
 */
export function segmentIndexAt(starts: readonly number[], positionSec: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= positionSec) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** "4 of 12", "No matches", or nothing before a search. */
export function matchLabel(matches: number, at: number, query: string): string | null {
  if (query.trim().length < 2) return null;
  if (matches === 0) return 'No matches';
  return `${at + 1} of ${matches}`;
}

/**
 * What "Ask Samwell about this" hands him: the line as the passage, timed and
 * named, and the blocks around it as the context.
 */
export function linePassage(
  doc: TranscriptDoc,
  line: Pick<TranscriptLine, 'segment' | 'time' | 'text' | 'speaker'>,
  around = 1,
): { passage: string; context: string } {
  const name = line.speaker != null ? doc.speakers[line.speaker] : null;
  const passage = `${line.time ? `[${line.time}] ` : ''}${name ? `${name}: ` : ''}${line.text}`;
  const from = Math.max(0, line.segment - around);
  const to = Math.min(doc.segments.length - 1, line.segment + around);
  const context: string[] = [];
  for (let i = from; i <= to; i++) context.push(segmentLine(doc, i));
  return { passage, context: context.join('\n') };
}
