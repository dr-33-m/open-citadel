/**
 * The book's voice handed over to read-aloud in the reader, with nothing to
 * hear but the voice going on.
 *
 * The book plays on while the reader opens and read-aloud makes ready. Read-
 * aloud is started on a sentence a few seconds ahead (`LEAD_SEC`: the patched
 * Readium places its navigator on that very sentence, not on its paragraph),
 * and the player is told to stop at the end of the sentence before it
 * (`sleepAfterMediaItemAtIndex`). Read-aloud's first audio is held here until
 * the player has stopped (`afterHandover`); that sentence was already made
 * for the book, so it is in hand long before. Only then does the book step
 * out of the player (`onHandedOver`): nothing cut short, nothing said twice,
 * no wait between them.
 */
import TrackPlayer from '@rntp/player';

import { placeLocator, type SentenceLocator } from '@/features/audiobook/utils/sentence-locator';
import { fractionAt } from '@/services/audiobook/position';
import { sentenceAfter } from '@/services/audiobook/producer';
import { current, playingEntry } from '@/services/audiobook/session';
import { store } from '@/services/player/session';
import { selectBook, selectPlaying } from '@/stores/player';

/**
 * How far ahead read-aloud begins: its time to get ready (the native
 * navigator, the sentence's place, its audio from the cache) while the book
 * plays on. Under it, the player would stop before read-aloud could speak:
 * on the A33 the reader took about 6.5 s from the tap to read-aloud's first audio.
 */
const LEAD_SEC = 8;
/** Past the player's last sentence, the longest read-aloud is held before going on anyway. */
const SPARE_MS = 2_500;
/** However long the sentence, read-aloud never waits longer than this. */
const LONGEST_WAIT_MS = 30_000;

type Gate = { held: (() => void)[]; onHandedOver: () => void; timer: ReturnType<typeof setTimeout> };

let gate: Gate | null = null;

/**
 * Starts the handover if this book is playing: picks the sentence read-aloud
 * begins on (`LEAD_SEC` ahead), tells the player to stop at the end of the
 * one before it, and holds read-aloud's audio till then. Returns where
 * read-aloud begins and the voice to begin in, or null when there is nothing
 * to hand over.
 */
export async function beginHandover(bookId: string, onHandedOver: () => void): Promise<{ locator: SentenceLocator; voiceKey: string } | null> {
  const s = current();
  const entry = s ? playingEntry(s) : null;
  if (!s || !entry || selectBook(store())?.bookId !== bookId || !store().loaded || !selectPlaying(store())) return null;
  // The first queued sentence that starts at least LEAD_SEC from now, at the listener's speed.
  const speed = Math.max(0.25, store().speed);
  let last = s.playing;
  let left = Math.max(0, entry.track.seconds - TrackPlayer.getProgress().position) / speed;
  while (left < LEAD_SEC && last + 2 < s.queue.length) {
    last += 1;
    left += s.queue[last].track.seconds / speed;
  }
  const next = s.queue[last + 1]?.sentence ?? (await sentenceAfter(s, s.queue[last].sentence));
  const section = next ? s.script.section(next.section) : null;
  if (!next || !section || current() !== s) return null;

  cancelHandover();
  s.keepQueue = true;
  TrackPlayer.sleepAfterMediaItemAtIndex(last);
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
  letQueueGo();
  for (const provide of open.held) provide();
  open.onHandedOver();
}

/** The reader closed before the player had finished: the book plays on as it was. */
export function cancelHandover(): void {
  const open = gate;
  if (!open) return;
  gate = null;
  clearTimeout(open.timer);
  letQueueGo();
  TrackPlayer.cancelSleepTimer();
}

function letQueueGo(): void {
  const s = current();
  if (s) s.keepQueue = false;
}

export function handingOver(): boolean {
  return gate !== null;
}
