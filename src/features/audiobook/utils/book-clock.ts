/**
 * The audiobook's clock: where the listener is in the whole book, in seconds,
 * and which sentence a time falls in.
 *
 * Nothing is made ahead of the voice by more than a few minutes, so most of
 * the book has no audio yet and its length is an estimate: its characters at
 * the voice's pace. A sentence that has been made has a measured length (its
 * MP3's own), so the clock firms up as the book is heard. A section whose
 * sentences are in hand is summed sentence by sentence; one that is not is
 * summed from what has been measured in it and its characters for the rest.
 *
 * Every time here is in the audio's own seconds, at 1×. What the listener
 * sees is divided by the playback rate (`atRate`), so a book at 1.5× is
 * shorter by a third and changing speed never changes which sentence a place
 * is in.
 *
 * Pure, so it can be tested on its own.
 */
import { CHARACTERS_PER_SECOND } from 'samwell-shared';

import { sectionOfId, type Sentence } from '@/features/audiobook/utils/sentences-of';

/** A section of the book as the timeline needs it: only the ones that are read aloud. */
export interface ClockSection {
  index: number;
  /** Characters in its text, the separators between paragraphs included. */
  chars: number;
  paragraphs: number;
}

/** A sentence's measured length, and its characters, by sentence id. */
export type Lengths = ReadonlyMap<string, Measured>;
export interface Measured {
  sec: number;
  chars: number;
}

/** Characters spoken in a section: its text without the two-character gaps between paragraphs. */
export function spokenChars(section: ClockSection): number {
  return Math.max(0, section.chars - 2 * Math.max(0, section.paragraphs - 1));
}

/** What has been measured in each section, summed once rather than once a section. */
export function measuredBySection(lengths: Lengths): Map<number, Measured> {
  const totals = new Map<number, Measured>();
  for (const [id, measured] of lengths) {
    const section = sectionOfId(id);
    if (section === null) continue;
    const total = totals.get(section) ?? { sec: 0, chars: 0 };
    total.sec += measured.sec;
    total.chars += measured.chars;
    totals.set(section, total);
  }
  return totals;
}

/** A sentence's length: measured, or its characters at the pace. */
export function sentenceSeconds(sentence: Pick<Sentence, 'id' | 'text'>, lengths: Lengths, pace: number): number {
  return lengths.get(sentence.id)?.sec ?? sentence.text.length / pace;
}

export interface Timeline {
  /** Sections in reading order: the index into this is the section's order. */
  sections: readonly ClockSection[];
  /** Where each section starts, in seconds, by order. */
  starts: number[];
  /** Each section's length, by order. */
  lengths: number[];
  total: number;
}

/**
 * The whole book laid out in seconds. `scripts` holds the sections whose
 * sentences are in hand; those are summed exactly, so a sentence's place in
 * its section and its section's place in the book always agree.
 */
export function timeline(
  sections: readonly ClockSection[],
  lengths: Lengths,
  pace: number,
  scripts: ReadonlyMap<number, readonly Sentence[]> = new Map(),
): Timeline {
  const measured = measuredBySection(lengths);
  const starts: number[] = [];
  const sizes: number[] = [];
  let at = 0;
  for (const section of sections) {
    starts.push(at);
    const script = scripts.get(section.index);
    let size: number;
    if (script) {
      size = script.reduce((sum, sentence) => sum + sentenceSeconds(sentence, lengths, pace), 0);
    } else {
      const done = measured.get(section.index) ?? { sec: 0, chars: 0 };
      size = done.sec + Math.max(0, spokenChars(section) - done.chars) / pace;
    }
    sizes.push(size);
    at += size;
  }
  return { sections, starts, lengths: sizes, total: at };
}

/** The order of a section in the timeline, or -1. */
export function orderOf(line: Timeline, section: number): number {
  return line.sections.findIndex((s) => s.index === section);
}

/** Seconds into the book at a sentence of a section, plus how far into that sentence. */
export function bookPosition(
  line: Timeline,
  script: readonly Sentence[],
  index: number,
  intoSentence: number,
  lengths: Lengths,
  pace: number,
): number {
  const sentence = script[index];
  if (!sentence) return 0;
  const order = orderOf(line, sentence.section);
  let at = order >= 0 ? line.starts[order] : 0;
  for (let i = 0; i < index; i++) at += sentenceSeconds(script[i], lengths, pace);
  const own = sentenceSeconds(sentence, lengths, pace);
  return at + Math.min(Math.max(0, intoSentence), own);
}

/** The section a time in the book falls in, by order, and how far into it. Clamped to the book. */
export function sectionAt(line: Timeline, seconds: number): { order: number; into: number } {
  if (line.sections.length === 0) return { order: -1, into: 0 };
  const t = Math.min(Math.max(0, seconds), line.total);
  let order = line.sections.length - 1;
  for (let i = 0; i < line.starts.length; i++) {
    if (t < line.starts[i] + line.lengths[i]) {
      order = i;
      break;
    }
  }
  return { order, into: Math.max(0, t - line.starts[order]) };
}

/** The sentence a time into a section falls in, and how far into it. Past the end is the last sentence's end. */
export function sentenceAt(
  script: readonly Sentence[],
  into: number,
  lengths: Lengths,
  pace: number,
): { index: number; offset: number } {
  if (script.length === 0) return { index: -1, offset: 0 };
  let at = 0;
  for (let i = 0; i < script.length; i++) {
    const own = sentenceSeconds(script[i], lengths, pace);
    if (into < at + own) return { index: i, offset: Math.max(0, into - at) };
    at += own;
  }
  const last = script.length - 1;
  return { index: last, offset: sentenceSeconds(script[last], lengths, pace) };
}

/** Seconds of audio as the listener hears them at a rate. */
export function atRate(seconds: number, rate: number): number {
  return rate > 0 ? seconds / rate : seconds;
}

/** A voice's pace as learned so far: characters a second over every sentence measured. */
export interface PaceStats {
  chars: number;
  sec: number;
}

export const NO_PACE: PaceStats = { chars: 0, sec: 0 };

/** Characters a second: learned once a little has been heard, the shared estimate until then. */
export function paceOf(stats: PaceStats): number {
  return stats.sec >= 5 && stats.chars > 0 ? stats.chars / stats.sec : CHARACTERS_PER_SECOND;
}

/** The running mean with one more measured sentence in it. */
export function learnPace(stats: PaceStats, sample: Measured): PaceStats {
  if (!(sample.sec > 0) || !(sample.chars > 0)) return stats;
  return { chars: stats.chars + sample.chars, sec: stats.sec + sample.sec };
}
