import type { ReadiumViewRef } from '@dr33m/react-native-readium';
import React from 'react';

import { beginHandover, cancelHandover } from '@/services/audiobook/handover';
import { catchUpBook } from '@/services/audiobook/resume';
import { readerVoiceId } from '@/services/device-tts/catalogue';
import { releasePlayerForSpeech } from '@/services/player';
import { startMediaSession } from '@/services/tts-media-session';
import { selectBook, selectPlaying, usePlayer } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';

type ReadAloudState = { isPlaying: boolean; isPaused: boolean; rate: number };
type OpenBook = { title: string; author: string; coverUrl: string | null } | null;

/**
 * Opening the book that is being heard hands the voice over to the reader's
 * read-aloud, in the same voice and at the same speed, so that the voice
 * simply goes on (`services/audiobook/handover`): the player finishes the
 * sentence it is on, and read-aloud begins on the next one as it ends.
 *
 * Decided once, as the book opens: a book started later is not handed over.
 * Read-aloud is started once the page has been drawn; leaving before the
 * player has finished its sentence calls it off, and the book plays on.
 *
 * `onStarted` is the reader's own state setter: it marks read-aloud as on.
 */
export function useAudiobookHandover({
  bookId,
  painted,
  readerRef,
  book,
  onStarted,
}: {
  bookId: string | undefined;
  painted: boolean;
  readerRef: React.RefObject<ReadiumViewRef | null>;
  book: OpenBook;
  onStarted: (state: ReadAloudState) => void;
}): void {
  const [handing] = React.useState(() => {
    const state = usePlayer.getState();
    return !!bookId && selectBook(state)?.bookId === bookId && state.loaded && selectPlaying(state);
  });
  const started = React.useRef(false);
  // Read when the player lets go, not when read-aloud starts: the book's row may still be loading then.
  const bookRef = React.useRef(book);
  React.useEffect(() => {
    bookRef.current = book;
  }, [book]);

  React.useEffect(() => {
    if (!handing || !painted || !bookId || started.current) return;
    started.current = true;
    const begin = async () => {
      const place = await beginHandover(bookId, () => {
        releasePlayerForSpeech();
        const open = bookRef.current;
        startMediaSession(open?.title ?? 'Reading', open?.author ?? '', open?.coverUrl ?? null);
      });
      if (!place) return;
      const settings = useSettingsStore.getState();
      if (settings.ttsVoice !== place.voiceKey) await settings.setTtsVoice(place.voiceKey);
      const rate = useSettingsStore.getState().ttsRate;
      readerRef.current?.ttsStart({ voice: readerVoiceId(place.voiceKey), rate, fromLocator: JSON.stringify(place.locator) });
      onStarted({ isPlaying: true, isPaused: false, rate });
    };
    void begin();
  }, [handing, painted, bookId, readerRef, onStarted]);

  // Leaving the book: a handover not yet done is called off, and a book
  // waiting in the mini player catches up with where read-aloud got to.
  React.useEffect(
    () => () => {
      cancelHandover();
      if (bookId) void catchUpBook(bookId);
    },
    [bookId],
  );
}
