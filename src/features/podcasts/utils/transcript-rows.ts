/**
 * A transcript as the sheet draws it: its rows and their labels, the row
 * being spoken, search, and the passage a long press hands Samwell. Pure.
 */
import type { TranscriptDoc } from 'samwell-shared';

import { segmentLine } from '@/services/podcasts/transcript/episode-prompt';
import { formatClock } from '@/utils/clock';

/** Whether a transcript has times to follow the audio by. Plain-text ones do not. */
export function isTimed(doc: Pick<TranscriptDoc, 'segments'>): boolean {
  return doc.segments.some((segment) => segment.end > 0);
}

/**
 * The row being spoken: the last whose start is at or before the position.
 * A binary search, so a two hour transcript costs a dozen steps a tick.
 * -1 before the first row.
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

/** Rows whose words (or speaker) hold the query, in order. Case and accents ignored. */
export function transcriptMatches(doc: TranscriptDoc, query: string): number[] {
  const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const needle = fold(query.trim());
  if (needle.length < 2) return [];
  const found: number[] = [];
  doc.segments.forEach((segment, i) => {
    const speaker = segment.speaker != null ? doc.speakers[segment.speaker] ?? '' : '';
    if (fold(segment.text).includes(needle) || fold(speaker).includes(needle)) found.push(i);
  });
  return found;
}

/** "4 of 12", "No matches", or nothing before a search. */
export function matchLabel(matches: number, at: number, query: string): string | null {
  if (query.trim().length < 2) return null;
  if (matches === 0) return 'No matches';
  return `${at + 1} of ${matches}`;
}

/**
 * Whether a row opens a new speaker's block. The same speaker carrying on
 * does not repeat their label.
 */
export function startsBlock(doc: TranscriptDoc, index: number): boolean {
  if (index === 0) return true;
  return doc.segments[index].speaker !== doc.segments[index - 1].speaker;
}

export type TranscriptRow = {
  index: number;
  /** "LEX FRIDMAN · 12:04" at the start of a speaker's block, null while they carry on. */
  label: string | null;
  speaker: number | null;
  text: string;
  start: number;
};

/**
 * The sheet's rows. A new speaker opens a block with their name and time; the
 * same speaker carrying on does not repeat it. A transcript that names nobody
 * gives every row its time instead, so the list can still be found by when.
 */
export function transcriptRows(doc: TranscriptDoc): TranscriptRow[] {
  const timed = isTimed(doc);
  const named = doc.speakers.length > 0;
  return doc.segments.map((segment, index) => {
    const name = segment.speaker != null ? doc.speakers[segment.speaker] : null;
    const time = timed ? formatClock(segment.start) : null;
    const opens = startsBlock(doc, index) || !named;
    const label = opens ? [name?.toUpperCase(), time].filter(Boolean).join(' · ') || null : null;
    return { index, label, speaker: segment.speaker, text: segment.text, start: segment.start };
  });
}

/**
 * What "Ask Samwell about this" hands him: the row as the passage, the rows
 * around it as the context, each line with its time and speaker.
 */
export function rowPassage(doc: TranscriptDoc, index: number, around = 3): { passage: string; context: string } {
  const from = Math.max(0, index - around);
  const to = Math.min(doc.segments.length - 1, index + around);
  const context: string[] = [];
  for (let i = from; i <= to; i++) context.push(segmentLine(doc, i));
  return { passage: segmentLine(doc, index), context: context.join('\n') };
}
