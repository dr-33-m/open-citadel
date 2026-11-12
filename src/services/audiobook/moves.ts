/**
 * Moving about the book: to a time on its clock (the scrubber, the skips, the
 * lock screen's chapter bar), to a sentence (the text sheet, the reader's skip
 * buttons), or to a page (the reader's "Listen from here"). A sentence already
 * made plays from the queue; one not made yet is made from there.
 */
import TrackPlayer from '@rntp/player';

import { sectionAt, sentenceAt } from '@/features/audiobook/utils/book-clock';
import type { Sentence } from '@/features/audiobook/utils/sentences-of';
import { beginBook } from '@/services/audiobook/begin';
import { publish } from '@/services/audiobook/lifecycle';
import { sentenceAtLocator } from '@/services/audiobook/start';
import { saveBookPlace } from '@/services/audiobook/position';
import { produce, sentenceAfter, sentenceBefore } from '@/services/audiobook/producer';
import { nativePlace, skipWithinQueue } from '@/services/audiobook/queue';
import { bookSecondsAt, clockPaceOf, current, placeSentence, timelineOf, type BookSession } from '@/services/audiobook/session';
import type { SpineLocator } from '@/services/epub-spine';
import { markStarting, store } from '@/services/player/session';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook } from '@/stores/player';

/** Where the listener is in the book now, in the audio's own seconds. */
export function bookPositionNow(s: BookSession): number {
  if (s.pending) return bookSecondsAt(s, s.pending.sentence, s.pending.offsetSec);
  const { index, position } = nativePlace(s);
  const entry = s.queue[index];
  return entry ? bookSecondsAt(s, entry.sentence, position) : 0;
}

/** Moves to a sentence, `offsetSec` into it: within the queue when it is made, else made from there. */
export function jumpTo(s: BookSession, sentence: Sentence, offsetSec: number): void {
  const queued = s.queue.findIndex((entry) => entry.sentence.id === sentence.id);
  if (queued >= 0 && !s.pending) {
    s.waiting = false;
    skipWithinQueue(queued, offsetSec);
    store().patch({ movedAt: Date.now() });
    if (s.wantsToPlay && !TrackPlayer.isPlaying()) TrackPlayer.play();
    return;
  }
  // Not made yet: what was being made for the old place is let go, and the
  // book is made from the new one. The voice stops now rather than running on.
  s.generation += 1;
  s.making = false;
  s.madeToEnd = false;
  s.waiting = false;
  s.pending = { sentence, offsetSec };
  store().patch({ movedAt: Date.now() });
  // Going somewhere is asking for the voice again, whatever stopped it before.
  useAudiobook.getState().patch({ failure: null });
  TrackPlayer.pause();
  if (s.wantsToPlay) markStarting();
  publish(s);
  void saveBookPlace(s, true);
  void produce(s);
}

/** Seeks to a time in the book, in the audio's own seconds. */
export async function seekBook(seconds: number): Promise<void> {
  const s = current();
  if (!s) return;
  const line = timelineOf(s);
  const { order, into } = sectionAt(line, seconds);
  const section = line.sections[order];
  const script = section ? await s.script.load(section.index) : null;
  if (!script || current() !== s) return;
  const { index, offset } = sentenceAt(script.sentences, into, s.lengths.map, clockPaceOf(s));
  const sentence = script.sentences[index];
  if (sentence) jumpTo(s, sentence, offset);
}

/** Back or forward by a number of seconds of audio, as a podcast skips. */
export function skipBook(seconds: number): void {
  const s = current();
  if (s) void seekBook(Math.max(0, bookPositionNow(s) + seconds));
}

/** Seeks within the chapter playing, from the lock screen's chapter clock. */
export function seekInChapter(seconds: number): void {
  const s = current();
  const sentence = s ? placeSentence(s) : null;
  if (!s || !sentence) return;
  const line = timelineOf(s);
  const order = line.sections.findIndex((x) => x.index === sentence.section);
  if (order >= 0) void seekBook(line.starts[order] + Math.max(0, seconds));
}

/** Plays from a sentence of the book: a tap in the follow-along sheet. A book waiting in the mini player starts there. */
export async function playFromSentence(sentenceId: string): Promise<void> {
  const s = current();
  const now = selectBook(store());
  if (!s || !store().loaded) {
    if (now) await beginBook(now.bookId, { fromSentenceId: sentenceId });
    return;
  }
  const script = await s.script.load(Number.parseInt(sentenceId, 10));
  const sentence = script?.sentences.find((x) => x.id === sentenceId);
  if (!sentence || current() !== s) return;
  // Going there means hearing it: `jumpTo` plays what is made, and makes what is not.
  s.wantsToPlay = true;
  jumpTo(s, sentence, 0);
}

/** A sentence back or on: the reader's skip buttons while it follows the book. */
export async function skipSentence(by: 1 | -1): Promise<void> {
  const s = current();
  const at = s ? placeSentence(s) : null;
  if (!s || !at) return;
  const to = by > 0 ? await sentenceAfter(s, at) : await sentenceBefore(s, at);
  if (to && current() === s) jumpTo(s, to, 0);
}

/**
 * Plays from a page of the book: "Listen from here" in the reader, from the
 * page on screen, placed exactly by `text` (its first visible text) when known.
 * Answers the sentence the voice was sent to, or null when it is already there
 * (a book started afresh) or went nowhere: a sentence already made is played
 * from the queue, and is only heard there once the player has moved to it.
 */
export async function playFromLocator(locator: SpineLocator, text?: string | null): Promise<string | null> {
  const s = current();
  if (!s || !store().loaded) {
    const now = selectBook(store());
    if (now) await beginBook(now.bookId, { fromLocator: locator, fromText: text });
    return null;
  }
  const sentence = await sentenceAtLocator(s.script, locator, text);
  if (!sentence || current() !== s) return null;
  s.wantsToPlay = true;
  jumpTo(s, sentence, 0);
  return sentence.id;
}
