/** What the player's controls do to a book: play and pause, seek, skip, speed, the end of a chapter, the voice. */
import TrackPlayer from '@rntp/player';

import { atRate, sectionAt, sentenceAt } from '@/features/audiobook/utils/book-clock';
import { chapterTitle } from '@/features/audiobook/utils/chapter-title';
import type { Sentence } from '@/features/audiobook/utils/sentences-of';
import { currentBookVoice, publish, startBook } from '@/services/audiobook/lifecycle';
import { saveBookPlace } from '@/services/audiobook/position';
import { produce } from '@/services/audiobook/producer';
import { skipWithinQueue } from '@/services/audiobook/queue';
import { bookSecondsAt, clockPaceOf, current, placeSentence, playingEntry, timelineOf, type BookSession } from '@/services/audiobook/session';
import { markStarting, store } from '@/services/player/session';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook, selectPlaying } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';

/**
 * Starts the book, from a sentence if given. Without a plan that reaches a
 * cloud voice (one that lapsed since the book was last heard), the plans rise
 * instead, so the press is never answered by nothing.
 */
async function begin(bookId: string, fromSentenceId: string | null = null): Promise<void> {
  const result = await startBook(bookId, { fromSentenceId });
  if (result === 'no-voice') useAudiobook.getState().patch({ plansAsked: useAudiobook.getState().plansAsked + 1 });
}

/** Play or pause, answered at once: the loader shows through a wait for the next sentence. */
export async function toggleBook(): Promise<void> {
  const now = selectBook(store());
  const s = current();
  if (!now) return;
  if (!s || !store().loaded) {
    await begin(now.bookId);
    return;
  }
  if (selectPlaying(store())) {
    s.wantsToPlay = false;
    store().patch({ isPlaying: false, starting: false });
    TrackPlayer.pause();
    void saveBookPlace(s, true);
    return;
  }
  s.wantsToPlay = true;
  markStarting();
  if (useAudiobook.getState().failure) {
    retryBook();
    return;
  }
  if (s.pending || s.waiting) {
    void produce(s);
    return;
  }
  TrackPlayer.play();
}

/** Where the listener is in the book now, in the audio's own seconds. */
export function bookPositionNow(s: BookSession): number {
  if (s.pending) return bookSecondsAt(s, s.pending.sentence, s.pending.offsetSec);
  const entry = playingEntry(s);
  return entry ? bookSecondsAt(s, entry.sentence, TrackPlayer.getProgress().position) : 0;
}

/** Moves to a sentence, `offsetSec` into it: within the queue when it is made, else made from there. */
export function jumpTo(s: BookSession, sentence: Sentence, offsetSec: number): void {
  const queued = s.queue.findIndex((entry) => entry.sentence.id === sentence.id);
  if (queued >= 0 && !s.pending) {
    s.waiting = false;
    skipWithinQueue(queued, offsetSec);
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

/** The book's speed is the reader's: set as the player's own rate, so the audio never has to be made again. */
export function setBookSpeed(rate: number): void {
  if (store().loaded) TrackPlayer.setPlaybackSpeed(rate);
  store().patch({ speed: rate });
  void useSettingsStore.getState().setTtsRate(rate);
}

/** Pauses when the chapter ends: armed on its last sentence, which is when the native player can be told. */
export function armChapterSleep(s: BookSession): void {
  if (store().sleep?.kind !== 'end') return;
  const entry = playingEntry(s);
  const script = entry ? s.script.peek(entry.sentence.section) : null;
  if (entry && script?.sentences.at(-1)?.id === entry.sentence.id) TrackPlayer.sleepAfterMediaItemAtIndex();
}

export function sleepAtChapterEnd(): void {
  store().patch({ sleep: { kind: 'end' } });
  const s = current();
  if (s) armChapterSleep(s);
}

/**
 * The voice was changed in the player (which changes the reader's too): the
 * book carries on in it from the sentence being heard. Nothing happens when
 * it is the voice already reading.
 */
export async function followBookVoice(): Promise<void> {
  const s = current();
  const now = selectBook(store());
  if (!now || currentBookVoice()?.key === s?.voiceKey) return;
  const sentence = s ? placeSentence(s) : null;
  await begin(now.bookId, sentence?.id ?? null);
}

/** After a failure: "Try again", a plan bought, or the network back. A book not started yet starts. */
export function retryBook(): void {
  const s = current();
  if (!s || !store().loaded) {
    const now = selectBook(store());
    if (now) void begin(now.bookId, useAudiobook.getState().sentenceId);
    return;
  }
  useAudiobook.getState().patch({ failure: null });
  if (s.wantsToPlay) markStarting();
  void produce(s);
}

/**
 * Where the listener is in the book and how long it is, as they hear it: at
 * their speed, so the clock and the time left shrink as the speed rises. What
 * the player's bars draw; before the book has loaded, where it was left.
 */
export function bookClockNow(): { position: number; duration: number } {
  const s = current();
  const rate = store().speed;
  if (!s || !store().loaded) {
    const now = selectBook(store());
    return { position: atRate(now?.positionSec ?? 0, rate), duration: atRate(now?.durationSec ?? 0, rate) };
  }
  return { position: atRate(bookPositionNow(s), rate), duration: atRate(timelineOf(s).total, rate) };
}

export interface BookChapter {
  id: string;
  title: string;
  /** Where it starts on the book's clock, at the listener's speed. */
  startSec: number;
}

/** The book's chapters (its sections read aloud) on its clock, for the chapter list. */
export function bookChapters(): BookChapter[] {
  const s = current();
  if (!s) return [];
  const line = timelineOf(s);
  const rate = store().speed;
  return line.sections.map((section, order) => ({
    id: String(section.index),
    title: chapterTitle(s.script.section(section.index)?.title, s.info.title) ?? `Part ${order + 1}`,
    startSec: atRate(line.starts[order], rate),
  }));
}

/** Plays from a sentence of the book: a tap in the follow-along sheet. A book waiting in the mini player starts there. */
export async function playFromSentence(sentenceId: string): Promise<void> {
  const s = current();
  const now = selectBook(store());
  if (!s || !store().loaded) {
    if (now) await begin(now.bookId, sentenceId);
    return;
  }
  const script = await s.script.load(Number.parseInt(sentenceId, 10));
  const sentence = script?.sentences.find((x) => x.id === sentenceId);
  if (!sentence || current() !== s) return;
  // Going there means hearing it: `jumpTo` plays what is made, and makes what is not.
  s.wantsToPlay = true;
  jumpTo(s, sentence, 0);
}
