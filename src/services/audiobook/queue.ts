/**
 * The native player's queue, mirrored from the book: a few sentences behind
 * (so a skip back stays local), the one playing, and every one made ahead.
 *
 * Each sentence is an item exactly as it was cached, so the sentence being
 * spoken is simply the item playing: the follow-along sheet and Highlight
 * need no timing map that could drift. Each item carries where it sits in its
 * chapter (`chapterStart`, `chapterLength`), which the patched player turns
 * into one clock across the chapter on the lock screen and in the
 * notification.
 */
import TrackPlayer, { type MediaItem } from '@rntp/player';

import { chapterTitle } from '@/features/audiobook/utils/chapter-title';
import { bookMediaId } from '@/services/audiobook/media-id';
import { chapterClock, type BookSession, type QueuedSentence } from '@/services/audiobook/session';
import { pinPieces } from '@/services/cloud-tts/audio-cache';

/** Sentences kept behind the one playing. */
const KEEP_BEHIND = 3;

/** What the queue item for a sentence says about itself, read back when a runtime takes the book up again. */
export interface BookItemExtras {
  bookId: string;
  sentenceId: string;
  key: string;
  seconds: number;
  voiceKey: string;
  chapterStart: number;
  chapterLength: number;
}

function itemFor(s: BookSession, entry: QueuedSentence, startPosition = 0): MediaItem {
  const section = s.script.section(entry.sentence.section);
  const extras: BookItemExtras = {
    bookId: s.info.id,
    sentenceId: entry.sentence.id,
    key: entry.key,
    seconds: entry.track.seconds,
    voiceKey: s.voiceKey,
    ...chapterClock(s, entry.sentence),
  };
  return {
    mediaId: bookMediaId(s.info.id, entry.sentence.id),
    url: entry.track.uri,
    mimeType: entry.track.mimeType,
    title: s.info.title,
    artist: chapterTitle(section?.title, s.info.title) ?? s.info.author ?? undefined,
    albumTitle: s.info.author ?? undefined,
    artworkUrl: s.info.coverUrl ?? undefined,
    duration: entry.track.seconds > 0 ? entry.track.seconds : undefined,
    startPosition,
    extras: extras as unknown as Record<string, unknown>,
  };
}

function pin(s: BookSession): void {
  pinPieces(s.queue.map((entry) => entry.key));
}

/** Starts the native queue on one sentence, `startAt` seconds in. Whatever was queued before is replaced. */
export function loadQueue(s: BookSession, entry: QueuedSentence, startAt: number): void {
  s.queue = [entry];
  s.playing = 0;
  pin(s);
  TrackPlayer.setMediaItems([itemFor(s, entry, startAt)], 0);
}

/** A sentence has been made: it joins the end of the queue. */
export function appendToQueue(s: BookSession, entry: QueuedSentence): void {
  s.queue.push(entry);
  pin(s);
  TrackPlayer.addMediaItems([itemFor(s, entry)]);
}

/**
 * The native player moved to an item: the mirror follows, and sentences
 * long since heard leave the front so the queue does not grow with the book.
 * Returns the item's index once trimmed, or -1 for an item this queue does not hold.
 */
export function followTransition(s: BookSession, sentenceId: string): number {
  const at = s.queue.findIndex((entry) => entry.sentence.id === sentenceId);
  if (at < 0) return -1;
  const drop = s.keepQueue ? 0 : at - KEEP_BEHIND;
  if (drop > 0) {
    TrackPlayer.removeMediaItems(0, drop);
    s.queue.splice(0, drop);
  }
  s.playing = at - Math.max(0, drop);
  pin(s);
  return s.playing;
}

/** Moves to a queued sentence, `offsetSec` into it. */
export function skipWithinQueue(index: number, offsetSec: number): void {
  TrackPlayer.skipToIndex(index);
  if (offsetSec > 0.3) TrackPlayer.seekTo(offsetSec);
}

/** Lets go of every queued sentence: the cache may trim them again. */
export function unpinQueue(): void {
  pinPieces([]);
}
