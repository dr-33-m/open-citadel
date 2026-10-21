/**
 * The book's voice handed over to read-aloud in the reader, with nothing to
 * hear but the voice going on.
 *
 * The player says the sentence it is on to its end and stops there
 * (`sleepAfterMediaItemAtIndex`). Read-aloud is started on the sentence after
 * it (the patched Readium places its navigator on that very sentence, not on
 * its paragraph), and its first audio is held here until the player has
 * stopped (`afterHandover`). That sentence was already made for the book, so
 * it plays from the cache the moment it is let go. Only then does the book
 * step out of the player (`onHandedOver`), so nothing is cut short and
 * nothing is said twice.
 */
import TrackPlayer from '@rntp/player';

import { placeLocator, type SentenceLocator } from '@/features/audiobook/utils/sentence-locator';
import { fractionAt } from '@/services/audiobook/position';
import { sentenceAfter } from '@/services/audiobook/producer';
import { current, playingEntry } from '@/services/audiobook/session';
import { store } from '@/services/player/session';
import { selectBook, selectPlaying } from '@/stores/player';

/** Past the sentence's own end, the longest read-aloud is held before going on anyway. */
const SPARE_MS = 2_500;
/** However long the sentence, read-aloud never waits longer than this. */
const LONGEST_WAIT_MS = 30_000;

type Gate = { held: (() => void)[]; onHandedOver: () => void; timer: ReturnType<typeof setTimeout> };

let gate: Gate | null = null;

/**
 * Starts the handover if this book is playing: arms the player to stop at the
 * end of its sentence and holds read-aloud's audio till then. Returns where
 * read-aloud begins (the next sentence) and the voice to begin in, or null
 * when there is nothing to hand over.
 */
export async function beginHandover(bookId: string, onHandedOver: () => void): Promise<{ locator: SentenceLocator; voiceKey: string } | null> {
  const s = current();
  const entry = s ? playingEntry(s) : null;
  if (!s || !entry || selectBook(store())?.bookId !== bookId || !store().loaded || !selectPlaying(store())) return null;
  const next = s.queue[s.playing + 1]?.sentence ?? (await sentenceAfter(s, entry.sentence));
  const section = next ? s.script.section(next.section) : null;
  if (!next || !section || current() !== s) return null;

  TrackPlayer.sleepAfterMediaItemAtIndex();
  const left = Math.max(0, entry.track.seconds - TrackPlayer.getProgress().position) / Math.max(0.25, store().speed);
  cancelHandover();
  gate = { held: [], onHandedOver, timer: setTimeout(openHandover, Math.min(LONGEST_WAIT_MS, left * 1000 + SPARE_MS)) };
  return { locator: placeLocator(section, next, fractionAt(s, next)), voiceKey: s.voiceKey };
}

/** Read-aloud's audio: handed on now, or once the player has finished its sentence. */
export function afterHandover(provide: () => void): void {
  if (gate) gate.held.push(provide);
  else provide();
}

/** The player has said its last sentence: read-aloud's held audio goes first, then the book steps out. */
export function openHandover(): void {
  const open = gate;
  if (!open) return;
  gate = null;
  clearTimeout(open.timer);
  for (const provide of open.held) provide();
  open.onHandedOver();
}

/** The reader closed before the player had finished: the book plays on as it was. */
export function cancelHandover(): void {
  const open = gate;
  if (!open) return;
  gate = null;
  clearTimeout(open.timer);
  TrackPlayer.cancelSleepTimer();
}

export function handingOver(): boolean {
  return gate !== null;
}
