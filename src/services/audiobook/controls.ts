/** What the player's controls do to a book: play and pause, speed, the end of a chapter, the voice, its clock. Moving about it is `moves`. */
import TrackPlayer from '@rntp/player';

import { atRate, orderOf, sentenceSeconds } from '@/features/audiobook/utils/book-clock';
import { chapterTitle } from '@/features/audiobook/utils/chapter-title';
import { beginBook } from '@/services/audiobook/begin';
import { currentBookVoice } from '@/services/audiobook/lifecycle';
import { bookPositionNow } from '@/services/audiobook/moves';
import { saveBookPlace } from '@/services/audiobook/position';
import { produce } from '@/services/audiobook/producer';
import { clockPaceOf, current, placeSentence, playingEntry, timelineOf, type BookSession } from '@/services/audiobook/session';
import { markStarting, store } from '@/services/player/session';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook, selectPlaying } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';

/** Play or pause, answered at once: the loader shows through a wait for the next sentence. */
export async function toggleBook(): Promise<void> {
  const now = selectBook(store());
  const s = current();
  if (!now) return;
  if (!s || !store().loaded) {
    await beginBook(now.bookId);
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
  await beginBook(now.bookId, { fromSentenceId: sentence?.id ?? null });
}

/** After a failure: "Try again", a plan bought, or the network back. A book not started yet starts. */
export function retryBook(): void {
  const s = current();
  if (!s || !store().loaded) {
    const now = selectBook(store());
    if (now) void beginBook(now.bookId, { fromSentenceId: useAudiobook.getState().sentenceId });
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

/**
 * Where each sentence of a section starts on the book's clock, at the
 * listener's speed, by sentence id: what the follow-along sheet lights its
 * rows by, as a transcript's lines are lit by their times
 * (`useCurrentSegment`), rather than by the player saying it has moved on,
 * which can only come once the words have begun. Laid out as the clock is
 * (`bookClockNow`), so the two always agree. Null for a section not in hand.
 */
export function sentenceStarts(section: number): Map<string, number> | null {
  const s = current();
  const script = s?.script.peek(section);
  if (!s || !script) return null;
  const line = timelineOf(s);
  const order = orderOf(line, section);
  if (order < 0) return null;
  const pace = clockPaceOf(s);
  const rate = store().speed;
  const starts = new Map<string, number>();
  let at = line.starts[order];
  for (const sentence of script.sentences) {
    starts.set(sentence.id, atRate(at, rate));
    at += sentenceSeconds(sentence, s.lengths.map, pace);
  }
  return starts;
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

