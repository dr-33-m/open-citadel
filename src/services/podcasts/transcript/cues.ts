/**
 * What the feed transcript parsers share: reading a clock, telling a real
 * name from a machine label, and turning timed pieces into a `TranscriptDoc`
 * with the same cut rules Scribe's transcripts get. Pure.
 */
import { defaultSpeakerName, mergeTimedText, type TranscriptDoc, type TranscriptSegment } from 'samwell-shared';

import { decodeEntities } from '@/utils/html-entities';

/** One timed (or untimed) run of words, with whoever says it, as a parser found it. */
export type Piece = { start: number; end: number; speaker: string | null; text: string };

/** "01:02:10.500", "1:02:10", "02:10,5", "0:00" or plain seconds, to seconds. */
export function parseClock(raw: string | null | undefined): number | null {
  const text = (raw ?? '').trim().replace(',', '.');
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** "SPEAKER_00", "spk 2", "Speaker 1": labels that say a voice is distinct, not who it is. */
const MACHINE_LABEL = /^(speaker|spk|s)[\s_-]*\d+$/i;
const UNKNOWN_LABEL = /^(unknown|unk|\?+)$/i;

/** Tags out, entities decoded, whitespace collapsed. */
export function plainText(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Openings that are words, not people. */
const NOT_NAMES = new Set(['note', 'notes', 'update', 'edit', 'source', 'sources', 'transcript', 'warning', 'disclaimer', 'links', 'music', 'sponsor', 'ad']);

/**
 * "Name: words" openings that name speakers. A one-off "Note: ..." is words,
 * so the file has to show the habit first: some name opening twice, or a
 * machine label. Once it has, every short opening counts (a guest may speak
 * once), bar the few that are plainly not people.
 */
export function speakerPrefixes(lines: readonly string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const match = /^([A-Z][\w .'’-]{0,40}?):\s+\S/.exec(line);
    if (match) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  const habit = [...counts].some(([name, count]) => (count >= 2 && !NOT_NAMES.has(name.toLowerCase())) || MACHINE_LABEL.test(name));
  if (!habit) return new Set();
  return new Set(
    [...counts.keys()].filter((name) => !NOT_NAMES.has(name.toLowerCase()) && name.split(/\s+/).length <= 4),
  );
}

/** Splits a known "Name:" opening off a line. */
export function splitPrefix(line: string, known: Set<string>): { speaker: string | null; text: string } {
  const match = /^([A-Z][\w .'’-]{0,40}?):\s+([\s\S]*)$/.exec(line);
  if (match && known.has(match[1])) return { speaker: match[1], text: match[2] };
  return { speaker: null, text: line };
}

/**
 * Pieces to a transcript. Speakers are numbered by who talks first; a real
 * name is kept as it is written, a machine label becomes "Speaker 2", and an
 * "unknown" voice is nobody. Untimed pieces (plain text) keep their order and
 * are not merged, since there is no clock to cut them by.
 */
export function docFromPieces(pieces: readonly Piece[], language: string | null = null): TranscriptDoc {
  const labels: string[] = [];
  const index = (label: string | null): number | null => {
    const clean = label?.trim();
    if (!clean || UNKNOWN_LABEL.test(clean)) return null;
    const found = labels.indexOf(clean);
    if (found >= 0) return found;
    labels.push(clean);
    return labels.length - 1;
  };
  const indexed: TranscriptSegment[] = pieces
    .filter((piece) => piece.text.trim())
    .map((piece) => ({ start: piece.start, end: Math.max(piece.start, piece.end), speaker: index(piece.speaker), text: piece.text.trim() }));
  const timed = indexed.some((segment) => segment.end > 0);
  const segments = timed ? mergeTimedText(indexed) : indexed;
  return {
    version: 1,
    source: 'feed',
    language,
    durationSec: segments.reduce((max, segment) => Math.max(max, segment.end), 0),
    speakers: labels.map((label, i) => (MACHINE_LABEL.test(label) ? defaultSpeakerName(i) : label)),
    segments,
  };
}
