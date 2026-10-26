import type { Locator, ReadiumViewRef } from '@dr33m/react-native-readium';
import React from 'react';

import { FIRST_VISIBLE_TEXT_SCRIPT, VOICE_ON_SCREEN_SCRIPT } from '@/features/audiobook/utils/page-scripts';
import { voiceDirectionFrom } from '@/services/audiobook';

/**
 * The reader's pages and the voice, apart: whether they have stopped
 * following it (`detached`), the page on screen, and which way the voice is
 * from it (`voiceWay`), for `useReadAlong`'s BACK TO NOW / LISTEN FROM HERE.
 *
 * While apart, the page is asked about the voice whenever either moves: back
 * on its page (swiped back, or the voice reached the page being read) they
 * follow again on their own. A page turned by hand comes from Readium
 * (`onNavigatedByUser`); the reader's own jumps (a chapter, a bookmark, a
 * highlight) say so through `detach`.
 */
export function useOffTheVoice({ readerRef, sentenceId }: { readerRef: React.RefObject<ReadiumViewRef | null>; sentenceId: string | null }) {
  const [detached, setDetached] = React.useState(false);
  /** The page on screen, as the reader last reported it. */
  const [page, setPage] = React.useState<Locator | null>(null);
  const pageRef = React.useRef<Locator | null>(null);
  const sentenceRef = React.useRef(sentenceId);
  React.useEffect(() => {
    sentenceRef.current = sentenceId;
  }, [sentenceId]);
  /**
   * The page and the sentence as the pages stopped following. Until one of
   * them moves, the page is not asked whether the voice is on it: a jump
   * (a chapter, a highlight) detaches before it lands, and the page still on
   * screen is the voice's, which would bring the pages straight back.
   */
  const leftAt = React.useRef<{ page: Locator | null; sentenceId: string | null } | null>(null);
  /** Which way BACK TO NOW goes: 1 the voice is further on, -1 further back, null not known yet. */
  const [voiceWay, setVoiceWay] = React.useState<-1 | 0 | 1 | null>(null);

  const onLocationChange = React.useCallback((loc: Locator) => {
    pageRef.current = loc;
    setPage(loc);
  }, []);
  /** A sentence the voice was sent to and is not heard at yet. */
  const awaited = React.useRef<string | null>(null);
  const follow = React.useCallback(() => {
    leftAt.current = null;
    awaited.current = null;
    setDetached(false);
  }, []);
  /**
   * Follows again once the voice is heard at `target` (LISTEN FROM HERE): a
   * sentence already made plays from the queue, and is reported a moment after
   * the jump, so following at once would send the pages back to the old one
   * first. Null: the voice is there already.
   */
  const followOnceAt = React.useCallback(
    (target: string | null) => {
      if (target === null || target === sentenceRef.current) follow();
      else awaited.current = target;
    },
    [follow],
  );
  React.useEffect(() => {
    if (sentenceId !== null && sentenceId === awaited.current) follow();
  }, [sentenceId, follow]);

  // While off the voice's page, the page is asked about it whenever either
  // moves: back on it (swiped back, or the voice came to the page being read)
  // the pages follow again; else which way it is, from the page's first words,
  // since the voice can catch up with a page read ahead and pass it.
  React.useEffect(() => {
    if (!detached || !page) return undefined;
    let live = true;
    const reader = readerRef.current;
    const moved = leftAt.current?.page !== page || leftAt.current?.sentenceId !== sentenceId;
    void (async () => {
      const on = moved ? await reader?.evaluateJavaScript(VOICE_ON_SCREEN_SCRIPT) : null;
      if (!live) return;
      if (on === 'on') {
        follow();
        return;
      }
      const text = await reader?.evaluateJavaScript(FIRST_VISIBLE_TEXT_SCRIPT);
      const way = await voiceDirectionFrom(page as never, text);
      if (live) setVoiceWay(way);
    })();
    return () => {
      live = false;
    };
  }, [detached, page, sentenceId, readerRef, follow]);

  // The reader jumping somewhere (a chapter, a highlight, a bookmark): detached
  // before the jump lands, so the page on screen is still the voice's.
  const detach = React.useCallback(() => {
    // Only the first move off the voice is where the pages left it.
    leftAt.current ??= { page: pageRef.current, sentenceId: sentenceRef.current };
    setDetached(true);
  }, []);
  // A page turned by hand: reported once it has landed, so the page on screen
  // is already the new one and is asked about straight away (a swipe onto the
  // voice's own page follows again at once).
  const onNavigatedByUser = React.useCallback(() => setDetached(true), []);


  return { detached, page, voiceWay, onLocationChange, follow, followOnceAt, detach, onNavigatedByUser };
}
