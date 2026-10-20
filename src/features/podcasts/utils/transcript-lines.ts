/**
 * A transcript as lines to follow, the way lyrics are: a sentence or so each,
 * every one with its own time. Pure.
 *
 * A transcript is kept in blocks of up to forty seconds, which is the right
 * size for the reader and for Samwell but a wall of words to follow by ear.
 * Here each speaker's turn is read as one run of words (a block cut at forty
 * seconds can end mid-sentence, and the sentence carries on into the next)
 * and cut into its sentences, a long sentence at a clause near its middle
 * and a stray "Right." joined to its neighbour. A line's time is placed by
 * how far into its block its first word is: speech keeps a steady enough
 * pace inside one block that this lands within a second or two of the word.
 */
import type { TranscriptDoc } from 'samwell-shared';

import { formatClock } from '@/utils/clock';

/** A line longer than this is cut at a clause: past it, a phone shows a paragraph. */
export const LINE_MAX_CHARS = 120;
/** A line shorter than this joins the next one ("Yeah.", "Right."). */
export const LINE_MIN_CHARS = 12;
/** A long sentence is never cut closer than this to either end. */
const CUT_MIN_CHARS = 24;

/** Words a full stop does not end a sentence after. */
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'jr', 'sr', 'prof', 'inc', 'ltd', 'co', 'mt', 'no', 'eg', 'ie', 'etc']);

type Piece = { text: string; from: number };

/** Where sentences end in a passage: after . ! ? and any closing quote, before a word that does not start lower case. */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  for (const match of text.matchAll(/[.!?…]+["”’')\]]*(\s+)(?=\S)/g)) {
    const at = match.index ?? 0;
    const next = text[at + match[0].length];
    if (next.toLowerCase() === next && next.toUpperCase() !== next) continue;
    const word = /([\p{L}.]+)$/u.exec(text.slice(Math.max(0, at - 24), at + 1))?.[1] ?? '';
    const bare = word.replace(/\./g, '').toLowerCase();
    // "J. K. Rowling", "Mr. Smith", "e.g. this".
    if (text[at] === '.' && (bare.length === 1 || ABBREVIATIONS.has(bare))) continue;
    ends.push(at + match[0].length - match[1].length);
  }
  return ends;
}

/** A long piece cut in two at the clause break nearest its middle, or the space nearest it when it has none. */
function halve(piece: Piece): Piece[] {
  const { text, from } = piece;
  const middle = text.length / 2;
  let best = -1;
  for (const match of text.matchAll(/[,;:]\s+|\s+[–—-]\s+/g)) {
    const at = (match.index ?? 0) + match[0].length;
    if (at < CUT_MIN_CHARS || text.length - at < CUT_MIN_CHARS) continue;
    if (best < 0 || Math.abs(at - middle) < Math.abs(best - middle)) best = at;
  }
  if (best < 0) {
    const before = text.lastIndexOf(' ', middle);
    const after = text.indexOf(' ', middle);
    best = before < 0 ? after : after < 0 ? before : middle - before <= after - middle ? before : after;
    if (best <= 0) return [piece];
    best += 1;
  }
  const head = text.slice(0, best).trimEnd();
  return [
    { text: head, from },
    { text: text.slice(best), from: from + best },
  ];
}

function shorten(piece: Piece): Piece[] {
  if (piece.text.length <= LINE_MAX_CHARS) return [piece];
  const halves = halve(piece);
  return halves.length === 1 ? halves : halves.flatMap(shorten);
}

/**
 * A passage cut into lines: its sentences, a long one halved at a clause
 * until it fits, a short one joined to the next. Each line keeps the
 * character it starts at in the passage, for its time.
 */
export function splitLines(text: string): Piece[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lead = text.indexOf(trimmed);
  const cuts = [0, ...sentenceEnds(trimmed), trimmed.length];
  const sentences: Piece[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const raw = trimmed.slice(cuts[i], cuts[i + 1]);
    const piece = raw.trim();
    if (piece) sentences.push({ text: piece, from: lead + cuts[i] + raw.indexOf(piece) });
  }

  const joined: Piece[] = [];
  let held: Piece | null = null;
  for (const sentence of sentences) {
    const piece: Piece = held ? { text: `${held.text} ${sentence.text}`, from: held.from } : sentence;
    held = null;
    if (piece.text.length < LINE_MIN_CHARS) held = piece;
    else joined.push(piece);
  }
  if (held) {
    const last = joined.pop();
    joined.push(last ? { text: `${last.text} ${held.text}`, from: last.from } : held);
  }
  return joined.flatMap(shorten);
}

export type TranscriptLine = {
  /** Its place in the list. */
  index: number;
  /** The block of the transcript it was cut from, for what a long press hands Samwell. */
  segment: number;
  /** Seconds into the episode; 0 for a transcript without times. */
  start: number;
  /** "12:04", or null for a transcript without times. */
  time: string | null;
  text: string;
  speaker: number | null;
  /** The speaker's name where their turn begins, null while they carry on or when nobody is named. */
  heading: string | null;
};

/** The transcript as lines to follow. (Samwell reads it by block: `transcriptLines` in episode-prompt.) */
export function followLines(doc: TranscriptDoc): TranscriptLine[] {
  const { segments } = doc;
  const timed = segments.some((segment) => segment.end > 0);
  const lines: TranscriptLine[] = [];
  let first = 0;
  while (first < segments.length) {
    const speaker = segments[first].speaker;
    let last = first;
    while (last + 1 < segments.length && segments[last + 1].speaker === speaker) last++;

    // The turn as one run of words, remembering where each block starts in it.
    const texts = segments.slice(first, last + 1).map((segment) => segment.text.trim());
    const starts: number[] = [];
    let run = '';
    for (const text of texts) {
      if (run && text) run += ' ';
      starts.push(run.length);
      run += text;
    }

    const name = speaker != null ? (doc.speakers[speaker] ?? null) : null;
    let block = 0;
    splitLines(run).forEach((piece, n) => {
      while (block + 1 < starts.length && starts[block + 1] <= piece.from) block++;
      const segment = segments[first + block];
      const into = (piece.from - starts[block]) / Math.max(1, texts[block].length);
      const start = timed ? segment.start + Math.max(0, segment.end - segment.start) * Math.min(1, into) : 0;
      lines.push({
        index: lines.length,
        segment: first + block,
        start,
        time: timed ? formatClock(start) : null,
        text: piece.text,
        speaker,
        heading: n === 0 && name ? name : null,
      });
    });
    first = last + 1;
  }
  return lines;
}

/** Lines whose words, or the name heading them, hold the query. Case and accents ignored. */
export function lineMatches(lines: readonly TranscriptLine[], query: string): number[] {
  const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const needle = fold(query.trim());
  if (needle.length < 2) return [];
  const found: number[] = [];
  for (const line of lines) {
    if (fold(line.text).includes(needle) || (line.heading && fold(line.heading).includes(needle))) found.push(line.index);
  }
  return found;
}
