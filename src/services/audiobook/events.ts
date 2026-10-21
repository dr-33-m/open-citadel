/**
 * The native player's events for a book: the voice moving to the next
 * sentence, running out of made sentences, reaching the end of the book, and
 * what the lock screen asks for (a drag of the chapter's bar, a skip). Heard
 * through the shared listener (`services/player/events`), in the background
 * too, so a locked phone keeps the book made ahead and its place kept.
 */
import TrackPlayer, { Event, PlaybackState, type BackgroundEvent } from '@rntp/player';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { books } from '@/db/schema';
import { watchConnection } from '@/lib/network';
import { armChapterSleep, seekInChapter, skipBook } from '@/services/audiobook/controls';
import { adopt, publish, stopBook } from '@/services/audiobook/lifecycle';
import { isBookItem, parseBookMediaId } from '@/services/audiobook/media-id';
import { saveBookPlace } from '@/services/audiobook/position';
import { produce, setProducerHooks } from '@/services/audiobook/producer';
import { followTransition } from '@/services/audiobook/queue';
import { current, type BookSession } from '@/services/audiobook/session';
import { addPlayerHandler } from '@/services/player/events';
import { clearStarting, markStarting, store } from '@/services/player/session';
import { finishRead } from '@/services/reading-position';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook } from '@/stores/player';

/** The session for a book item, taking the book up first if this runtime is not holding it. */
async function sessionFor(mediaId: string | undefined): Promise<BookSession | null> {
  if (!isBookItem(mediaId)) return null;
  const s = current();
  if (s && parseBookMediaId(mediaId)?.bookId === s.info.id) return s;
  return adopt(mediaId as string);
}

/** The last sentence has been heard: the place is saved at the end and the book moves to Have Read. */
async function finishBook(s: BookSession): Promise<void> {
  await saveBookPlace(s, true);
  const row = db.select().from(books).where(eq(books.id, s.info.id)).get();
  if (row) await finishRead(row);
  await stopBook();
}

/** The player ran out of made sentences. It waits, with its loader, unless the voice has stopped for a reason. */
async function ranDry(s: BookSession): Promise<void> {
  if (s.madeToEnd && s.playing >= s.queue.length - 1 && !s.pending) {
    await finishBook(s);
    return;
  }
  s.waiting = true;
  if (s.wantsToPlay && !useAudiobook.getState().failure) markStarting();
  void produce(s);
}

async function handleBookEvent(event: BackgroundEvent): Promise<void> {
  switch (event.type) {
    case Event.MediaItemTransition: {
      const s = await sessionFor(event.item?.mediaId);
      const id = parseBookMediaId(event.item?.mediaId);
      if (!s || !id || followTransition(s, id.sentenceId) < 0) return;
      s.waiting = false;
      publish(s);
      armChapterSleep(s);
      void produce(s);
      await saveBookPlace(s);
      return;
    }
    case Event.PlaybackProgressUpdated: {
      const s = await sessionFor(event.mediaId);
      if (!s) return;
      void produce(s);
      await saveBookPlace(s);
      return;
    }
    case Event.IsPlayingChanged: {
      const s = current();
      if (!s || !selectBook(store())) return;
      if (event.playing) {
        s.wantsToPlay = true;
        return;
      }
      // Paused by the listener (not run dry): the place is kept now.
      if (TrackPlayer.getPlaybackState() !== PlaybackState.Ended && !s.pending) s.wantsToPlay = false;
      await saveBookPlace(s, true);
      return;
    }
    case Event.PlaybackStateChanged: {
      const s = current();
      if (s && selectBook(store()) && event.state === PlaybackState.Ended) await ranDry(s);
      return;
    }
    case Event.PlaybackError:
      if (current() && selectBook(store())) useAudiobook.getState().patch({ failure: 'maker_failed' });
      return;
    case Event.RemoteSeek:
      if (selectBook(store())) seekInChapter(event.position);
      return;
    case Event.RemoteSkipForward:
      if (selectBook(store())) skipBook(event.interval);
      return;
    case Event.RemoteSkipBackward:
      if (selectBook(store())) skipBook(-event.interval);
      return;
    default:
      return;
  }
}

let unwatch: (() => void) | null = null;

setProducerHooks({
  onLanded: (s, _entry, first) => {
    if (first) {
      TrackPlayer.setPlaybackSpeed(store().speed);
      if (s.wantsToPlay) TrackPlayer.play();
      publish(s);
      return;
    }
    if (s.waiting) {
      s.waiting = false;
      TrackPlayer.skipToIndex(s.playing + 1);
      if (s.wantsToPlay) TrackPlayer.play();
    }
  },
  onFailure: (s, failure) => {
    useAudiobook.getState().patch({ failure });
    if (s.waiting) clearStarting();
    // Offline: carries on by itself when the network is back.
    if (failure !== 'offline' || unwatch) return;
    unwatch = watchConnection((online) => {
      if (!online) return;
      unwatch?.();
      unwatch = null;
      if (current() !== s) return;
      useAudiobook.getState().patch({ failure: null });
      if (s.waiting && s.wantsToPlay) markStarting();
      void produce(s);
    });
  },
});

addPlayerHandler(handleBookEvent);
