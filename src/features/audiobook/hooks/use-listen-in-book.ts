import type { Locator, ReadiumViewRef } from '@dr33m/react-native-readium';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { listenWay, whyNotListening } from '@/features/audiobook/utils/listen-way';
import { FIRST_VISIBLE_TEXT_SCRIPT } from '@/features/audiobook/utils/page-scripts';
import { createCloudVoicesQueryOptions } from '@/query-manager/cloud-voices';
import { currentBookVoice, showBook, startBook, stopBook } from '@/services/audiobook';
import { isCloudVoice } from '@/services/device-tts/catalogue';
import { useSettingsStore } from '@/stores/settings';

const TOAST = 'audiobook-listen-in-book';

/**
 * Listen, pressed inside the book: the audiobook from the page on screen,
 * with the reader following it (`useReadAlong` takes over as soon as the book
 * is in the player), as Listen from the Library does but without leaving the
 * page for the player.
 *
 * Only when the audiobook has a cloud voice to play (`listenWay`): a voice
 * picked on the phone, or no plan reaching a cloud voice, gets `readAloud`,
 * the reader's own read-aloud, as before.
 */
export function useListenInBook({
  bookId,
  readerRef,
  locatorRef,
  readAloud,
}: {
  bookId: string | undefined;
  readerRef: React.RefObject<ReadiumViewRef | null>;
  /** The page on screen, as the reader last reported it. */
  locatorRef: React.RefObject<Locator | null>;
  readAloud: () => void;
}): () => void {
  // What the plan's voices cost, which is what says the audiobook can play
  // one (`currentBookVoice`). Usually already read by the time a book opens.
  useQuery(createCloudVoicesQueryOptions());
  const starting = React.useRef(false);

  return React.useCallback(() => {
    if (!bookId || starting.current) return;
    const picked = useSettingsStore.getState().ttsVoice;
    const way = listenWay({
      phoneVoiceChosen: picked != null && !isCloudVoice(picked),
      bookVoiceReady: currentBookVoice() !== null,
    });
    if (way === 'read-aloud') {
      readAloud();
      return;
    }
    starting.current = true;
    void (async () => {
      try {
        // The book in the player at once, its loader on, so the reader's
        // controls answer the press while the book is read and placed.
        showBook(bookId);
        // The page's first words place the voice exactly; without them it
        // starts from the page's place, which is close enough.
        const text = (await readerRef.current?.evaluateJavaScript(FIRST_VISIBLE_TEXT_SCRIPT).catch(() => null)) ?? null;
        const result = await startBook(bookId, { fromLocator: locatorRef.current as never, fromText: text });
        if (result !== 'playing') showToast({ key: TOAST, message: whyNotListening(result, false) });
      } catch {
        // Never left in the player loading a book that is not coming.
        await stopBook().catch(() => undefined);
        showToast({ key: TOAST, message: whyNotListening('unreadable', false) });
      } finally {
        starting.current = false;
      }
    })();
  }, [bookId, readerRef, locatorRef, readAloud]);
}
