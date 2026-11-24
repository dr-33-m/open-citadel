/**
 * Finding a highlighted passage's words in a transcript's lines when the
 * transcript has been made again. Pure.
 *
 * The same audio transcribed twice says the same words, but not quite the
 * same way: punctuation and capitals move, a stutter ("y- you") is kept once
 * and dropped the next time, filler comes and goes, a word is now and then
 * heard differently, and the lines are cut in other places. So the passage
 * is compared as words with all of that taken out, a close match is enough,
 * it may run across lines, and where it is said more than once the copy
 * nearest its old moment wins. It is looked for near that moment first.
 *
 * Measured on episodes transcribed twice (see the PR that brought it in).
 */

/** Filler a transcriber may or may not write down. */
const FILLER = new Set(['um', 'uh', 'umm', 'uhm', 'er', 'erm', 'ah', 'hmm', 'mm', 'mhm', 'mmhmm']);

/**
 * How close a match must be, as the share of the passage's words that line
 * up: near its old moment, where the moment already says most of where it
 * is, and anywhere else, where only its words do.
 */
const NEAR_SIMILARITY = 0.7;
const ANYWHERE_SIMILARITY = 0.85;
/**
 * A passage this short or shorter is said all the time ("Yeah.", "[laughs]
 * Right."): it must match word for word, close to its old moment, and is
 * never looked for anywhere else, where a match is as likely another one.
 */
const EXACT_UP_TO_WORDS = 4;
/** A one-word passage ("Yeah.", "Well...") is found only on a line of at most this many words. */
const ONE_WORD_LINE_MAX = 3;
/** Looked for anywhere only when it has at least this many words to tell it apart. */
const ANYWHERE_MIN_WORDS = 6;
/** How far either side of its old moment a passage is looked for, in seconds; a short one, much closer. */
const NEAR_SECONDS = 120;
const SHORT_NEAR_SECONDS = 10;
/** A line is part of the match when this share of its words are. */
const LINE_COVERED = 0.5;

/** A sound the transcriber notes in square brackets ("[laughs]", "[upbeat music]"): not something said. */
const SOUND_TAG = /\[[^\]]*\]/g;

/**
 * A passage's words, compared without case, accents, punctuation, filler,
 * cut-off words or a word said twice in a row, and without the sounds noted
 * in square brackets, which a transcriber puts before or after the words, or
 * words differently, from one time to the next. A passage that is only a
 * sound ("[laughs]") is that sound.
 */
export function passageWords(text: string): string[] {
  const said = wordsOf(text.replace(SOUND_TAG, ' '));
  return said.length > 0 ? said : wordsOf(text);
}

function wordsOf(text: string): string[] {
  const words: string[] = [];
  for (const raw of text.split(/\s+/)) {
    // A word cut off ("y-", "th-") is a stutter: the next word says it.
    if (/[\p{L}\p{N}]-$/u.test(raw.replace(/[^\p{L}\p{N}'’-]+$/u, ''))) continue;
    const folded = raw.normalize('NFKD').replace(/\p{M}/gu, '').replace(/’/g, "'").toLowerCase();
    for (const match of folded.matchAll(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu)) {
      const word = match[0];
      if (FILLER.has(word) || words[words.length - 1] === word) continue;
      words.push(word);
    }
  }
  return words;
}

/** What a passage is looked for in: lines, each with its text and the moment it starts. */
export interface PassageLine {
  text: string;
  start: number;
}

/** Lines with their words worked out once, as they are asked for, however many passages are looked for in them. */
export class PassageIndex {
  private readonly words: (string[] | undefined)[];

  constructor(readonly lines: readonly PassageLine[]) {
    this.words = new Array(lines.length);
  }

  wordsOf(line: number): string[] {
    return (this.words[line] ??= passageWords(this.lines[line]!.text));
  }
}

export interface PassageMatch {
  /** The first and last lines the passage covers. */
  first: number;
  last: number;
  /** The share of the passage's words that lined up, 1 for word for word. */
  similarity: number;
}

type Found = { from: number; to: number; distance: number };

/**
 * Where `wanted` best fits in `text` (a word list), anywhere along it: the
 * fewest words changed, added or dropped (Sellers' semi-global edit
 * distance), with where the fit starts and ends. Every fit as good as the
 * best is returned, so a caller can choose between repeats.
 */
function bestFits(wanted: readonly string[], text: readonly string[]): Found[] {
  const n = wanted.length;
  // Two columns each, swapped: a whole transcript is thousands of words long.
  let cost = Array.from({ length: n + 1 }, (_, i) => i);
  let start = new Array<number>(n + 1).fill(0);
  let nextCost = new Array<number>(n + 1);
  let nextStart = new Array<number>(n + 1);
  const ends: Found[] = [];
  let best = n;
  for (let j = 1; j <= text.length; j++) {
    // A fit may begin anywhere: before the first passage word, nothing has been spent.
    nextCost[0] = 0;
    nextStart[0] = j;
    for (let i = 1; i <= n; i++) {
      const same = wanted[i - 1] === text[j - 1] ? 0 : 1;
      let c = cost[i - 1] + same;
      let s = start[i - 1];
      if (cost[i] + 1 < c) {
        c = cost[i] + 1;
        s = start[i];
      }
      if (nextCost[i - 1] + 1 < c) {
        c = nextCost[i - 1] + 1;
        s = nextStart[i - 1];
      }
      nextCost[i] = c;
      nextStart[i] = s;
    }
    [cost, nextCost] = [nextCost, cost];
    [start, nextStart] = [nextStart, start];
    const distance = cost[n];
    if (distance < best) {
      best = distance;
      ends.length = 0;
    }
    if (distance === best) ends.push({ from: start[n], to: j, distance });
  }
  return ends;
}

/** The lines `[from, to)` of a run of words falls in, as the lines that hold enough of it. */
function coveredLines(owner: readonly number[], words: (line: number) => string[], from: number, to: number): [number, number] {
  const counts = new Map<number, number>();
  for (let k = from; k < to; k++) counts.set(owner[k]!, (counts.get(owner[k]!) ?? 0) + 1);
  let most = owner[from]!;
  for (const [line, count] of counts) if (count > (counts.get(most) ?? 0)) most = line;
  const covered = [...counts.entries()].filter(([line, count]) => line === most || count >= words(line).length * LINE_COVERED).map(([line]) => line);
  return [Math.min(...covered), Math.max(...covered)];
}

/** The best match for the passage among `lines[from, to)`, or null when nothing is close enough. */
function matchIn(
  index: PassageIndex,
  wanted: readonly string[],
  range: { from: number; to: number },
  near: number | null,
  minSimilarity: number,
): PassageMatch | null {
  const { from, to } = range;
  const text: string[] = [];
  const owner: number[] = [];
  for (let line = from; line < to; line++) {
    for (const word of index.wordsOf(line)) {
      // Repeats fold within a line only: two lines alike in a row ("[laughs]") are two.
      text.push(word);
      owner.push(line);
    }
  }
  if (text.length === 0) return null;
  const fits = bestFits(wanted, text);
  const distance = fits[0]?.distance ?? wanted.length;
  const similarity = 1 - distance / wanted.length;
  if (wanted.length <= EXACT_UP_TO_WORDS ? distance > 0 : similarity < minSimilarity) return null;
  // Said more than once: the one nearest its old moment.
  const at = (fit: Found) => index.lines[owner[fit.from] ?? owner[fit.to - 1]!]!.start;
  const chosen = near === null ? fits[0]! : fits.reduce((a, b) => (Math.abs(at(b) - near) < Math.abs(at(a) - near) ? b : a));
  const [first, last] = coveredLines(owner, (line) => index.wordsOf(line), chosen.from, chosen.to);
  // One word is a short line, not a word inside a long one ("Well..." is not "as well").
  if (wanted.length === 1) {
    let words = 0;
    for (let line = first; line <= last; line++) words += index.wordsOf(line).length;
    if (words > ONE_WORD_LINE_MAX) return null;
  }
  return { first, last, similarity };
}

/** The lines starting within `seconds` of `near`. */
function around(lines: readonly PassageLine[], near: number, seconds: number): { from: number; to: number } {
  let from = 0;
  while (from < lines.length && lines[from]!.start < near - seconds) from++;
  let to = from;
  while (to < lines.length && lines[to]!.start <= near + seconds) to++;
  return { from, to };
}

/**
 * Where a passage is in the lines: near `near` (its old moment, in the
 * lines' clock) first, then, when it is long enough to tell apart and not
 * `nearOnly`, anywhere. Null when the lines do not have it closely enough to
 * say.
 */
export function findPassage(index: PassageIndex, passage: string, near: number | null, { nearOnly = false } = {}): PassageMatch | null {
  const wanted = passageWords(passage);
  if (wanted.length === 0) return null;
  const { lines } = index;
  const short = wanted.length <= EXACT_UP_TO_WORDS;
  if (near !== null) {
    const range = around(lines, near, short ? SHORT_NEAR_SECONDS : NEAR_SECONDS);
    const close = range.to > range.from ? matchIn(index, wanted, range, near, NEAR_SIMILARITY) : null;
    if (close || nearOnly || wanted.length < ANYWHERE_MIN_WORDS) return close;
  }
  return matchIn(index, wanted, { from: 0, to: lines.length }, near, ANYWHERE_SIMILARITY);
}
