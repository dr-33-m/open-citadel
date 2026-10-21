import type { ReadiumViewRef } from '@dr33m/react-native-readium';
import React from 'react';

import { currentBookVoice, readAlongLocator } from '@/services/audiobook';
import { readerVoiceId } from '@/services/device-tts/catalogue';
import { releasePlayerForSpeech } from '@/services/player';
import { startMediaSession } from '@/services/tts-media-session';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook, selectPlaying, usePlayer } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';

type Handover = { locator: string; voiceKey: string };
type ReadAloudState = { isPlaying: boolean; isPaused: boolean; rate: number };

/**
 * Opening the book that is being heard hands the voice over to the reader's
 * read-aloud, at the sentence being heard, in the same voice and at the same
 * speed, without a gap.
 *
 * On opening, while this book plays: the sentence's place is noted and the
 * reading voice set to the audiobook's. Once the page has been drawn,
 * read-aloud starts from that sentence (`fromLocator`). The audiobook keeps
 * playing until read-aloud's first sentence begins (`useHandoverUtterance`),
 * and only then steps aside. The overlap is under a second, and nothing is
 * heard twice but, at most, one sentence. Read-aloud asks for the same
 * sentences through the same piece source, so what the audiobook already made
 * plays from the cache.
 *
 * `onStarted` is the reader's own state setter: it marks read-aloud as on.
 */
export function useAudiobookHandover({
  bookId,
  painted,
  readerRef,
  onStarted,
}: {
  bookId: string | undefined;
  painted: boolean;
  readerRef: React.RefObject<ReadiumViewRef | null>;
  onStarted: (state: ReadAloudState) => void;
}): void {
  // Decided once, as the book opens: a book started later is not handed over.
  const [handover] = React.useState<Handover | null>(() => {
    const state = usePlayer.getState();
    if (!bookId || selectBook(state)?.bookId !== bookId || !state.loaded || !selectPlaying(state)) return null;
    const locator = readAlongLocator();
    const voice = currentBookVoice();
    return locator && voice ? { locator: JSON.stringify(locator), voiceKey: voice.key } : null;
  });
  const started = React.useRef(false);

  React.useEffect(() => {
    if (!handover || !painted || started.current) return;
    started.current = true;
    const begin = async () => {
      const settings = useSettingsStore.getState();
      if (settings.ttsVoice !== handover.voiceKey) await settings.setTtsVoice(handover.voiceKey);
      const rate = useSettingsStore.getState().ttsRate;
      useAudiobook.getState().patch({ handingOver: true });
      readerRef.current?.ttsStart({ voice: readerVoiceId(handover.voiceKey), rate, fromLocator: handover.locator });
      onStarted({ isPlaying: true, isPaused: false, rate });
    };
    void begin();
  }, [handover, painted, readerRef, onStarted]);
}

/**
 * The reader's utterance handler, with the handover's moment in it: read-aloud's
 * first sentence has begun, so the audiobook steps aside. On Android
 * read-aloud's lock-screen card takes the player, which lets the book go; iOS
 * has no such card, so the book is let go of here either way.
 */
export function useHandoverUtterance(
  next: (after: string | null | undefined) => void,
  book: { title: string; author: string; coverUrl: string | null } | null,
) {
  return React.useCallback(
    (after: string | null | undefined) => {
      next(after);
      if (!useAudiobook.getState().handingOver) return;
      useAudiobook.getState().patch({ handingOver: false });
      releasePlayerForSpeech();
      startMediaSession(book?.title ?? 'Reading', book?.author ?? '', book?.coverUrl ?? null);
    },
    [book, next],
  );
}
