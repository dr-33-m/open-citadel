/**
 * The book being heard, as this JS runtime holds it: its script, the voice,
 * the native queue as JS knows it, and where in it the voice is.
 *
 * One at a time. A fresh runtime (Android starts one for a background event
 * after the app was swiped away) has none until it takes the book back up
 * from the native queue (`adopt` in `lifecycle.ts`).
 */
import {
  bookPosition,
  orderOf,
  paceOf,
  steadyPace,
  sentenceSeconds,
  timeline,
  type PaceStats,
  type Timeline,
} from '@/features/audiobook/utils/book-clock';
import type { Sentence } from '@/features/audiobook/utils/sentences-of';
import type { SentenceLengths } from '@/services/audiobook/lengths';
import type { BookScript } from '@/services/audiobook/script';
import type { TrackFile } from '@/services/audiobook/track-file';
import type { CloudVoiceChoice } from '@/services/cloud-tts/piece-queue';
import type { PieceSource } from '@/services/cloud-tts/piece-source';

export interface BookInfo {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  /** A blog post's reader copy (`openArticleBook`) rather than a book. */
  post: boolean;
}

/** A sentence in the native queue: index i here is index i there. */
export interface QueuedSentence {
  sentence: Sentence;
  /** Its piece in the audio cache, pinned while it is queued. */
  key: string;
  track: TrackFile;
}

/** Where the producer starts after a jump to a sentence not yet made, and how far into it to begin. */
export interface PendingStart {
  sentence: Sentence;
  offsetSec: number;
}

export interface BookSession {
  info: BookInfo;
  script: BookScript;
  /** `cloud:<modelId>:<voice>`. */
  voiceKey: string;
  choice: CloudVoiceChoice;
  source: PieceSource;
  lengths: SentenceLengths;
  pace: PaceStats;
  /** The pace the clock is laid out by (`steadyPace`): null until first read. */
  clockPace: number | null;
  queue: QueuedSentence[];
  /** The queue item playing, or -1 before anything has loaded. */
  playing: number;
  /** Raised whenever the queue is rebuilt (a jump, a new voice), so work started for the old one is dropped. */
  generation: number;
  making: boolean;
  /** Every sentence of the book has been made and queued. */
  madeToEnd: boolean;
  /** The player reached the last made sentence and is waiting on the next. */
  waiting: boolean;
  /**
   * The listener means it to be playing: set by play, cleared by pause. What
   * decides whether a sentence landing after a wait (a slow voice, the network
   * back) carries on by itself.
   */
  wantsToPlay: boolean;
  pending: PendingStart | null;
  lastSavedAt: number;
}

export const book = {
  session: null as BookSession | null,
};

export function current(): BookSession | null {
  return book.session;
}

/** The item playing. */
export function playingEntry(s: BookSession): QueuedSentence | null {
  return s.queue[s.playing] ?? null;
}

/** The sentence the listener is at: the one playing, or the one a jump is waiting on. */
export function placeSentence(s: BookSession): Sentence | null {
  return s.pending?.sentence ?? playingEntry(s)?.sentence ?? null;
}

/** Characters a second, as the book's clock counts them. */
export function clockPaceOf(s: BookSession): number {
  s.clockPace = steadyPace(s.clockPace, paceOf(s.pace));
  return s.clockPace;
}

let memo: { key: string; line: Timeline } | null = null;

/** The book's timeline as it stands, laid out again only when something it is made from has changed. */
export function timelineOf(s: BookSession): Timeline {
  const cut = s.script.cutSentences();
  const pace = clockPaceOf(s);
  const key = `${s.info.id}|${s.voiceKey}|${s.lengths.map.size}|${[...cut.keys()].join(',')}|${pace}`;
  if (memo?.key !== key) memo = { key, line: timeline(s.script.clockSections, s.lengths.map, pace, cut) };
  return memo.line;
}

/** Seconds into the book at a sentence, plus `into` seconds of it, in the audio's own time. */
export function bookSecondsAt(s: BookSession, sentence: Sentence, into: number): number {
  const script = s.script.peek(sentence.section);
  if (!script) return 0;
  const index = script.sentences.findIndex((x) => x.id === sentence.id);
  return bookPosition(timelineOf(s), script.sentences, Math.max(0, index), into, s.lengths.map, clockPaceOf(s));
}

/** Where a sentence starts within its section, and how long the section is: the chapter clock the lock screen shows. */
export function chapterClock(s: BookSession, sentence: Sentence): { chapterStart: number; chapterLength: number } {
  const line = timelineOf(s);
  const order = orderOf(line, sentence.section);
  const script = s.script.peek(sentence.section);
  let start = 0;
  if (script) {
    for (const x of script.sentences) {
      if (x.id === sentence.id) break;
      start += sentenceSeconds(x, s.lengths.map, clockPaceOf(s));
    }
  }
  return { chapterStart: start, chapterLength: order >= 0 ? line.lengths[order] : 0 };
}

/** Made audio past the sentence playing, in the audio's own seconds. */
export function aheadSeconds(s: BookSession): number {
  let ahead = 0;
  for (let i = Math.max(0, s.playing + 1); i < s.queue.length; i++) ahead += s.queue[i].track.seconds;
  return ahead;
}
