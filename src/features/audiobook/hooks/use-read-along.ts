import type { DecorationGroup, Locator, ReadiumViewRef } from '@dr33m/react-native-readium';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { FIRST_VISIBLE_TEXT_SCRIPT, READ_ALONG_GROUP, VOICE_ON_SCREEN_SCRIPT } from '@/features/audiobook/utils/page-scripts';
import { sectionOfId } from '@/features/audiobook/utils/sentences-of';
import { createChapterTextQueryOptions } from '@/query-manager/audiobook';
import { playFromLocator, readAlongLocator, sentenceLocator, skipSentence, voiceDirectionFrom } from '@/services/audiobook';
import { stopPlayback, togglePlayback } from '@/services/player';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook, selectPlaying, usePlayer, usePlayerLoader } from '@/stores/player';

/**
 * Reading along with a book heard in the player: one voice, the player's,
 * and the reader following it, as Apple Books and Kindle read along.
 *
 * While the book open in the reader is the one in the player, the reader's
 * read-aloud is the player. Its controls play, pause and skip the player by a
 * sentence; the sentence being heard is lit in the page (a decoration
 * anchored by its words, so it lands exactly) and the page turns as the
 * voice crosses it. Nothing is handed over, so nothing can stop, wait or be
 * said twice, and going back to the player finds it exactly as it was.
 *
 * Turning a page by hand stops the pages following the voice (`detached`):
 * BACK TO NOW brings them back, LISTEN FROM HERE moves the voice to the page,
 * and coming back onto the voice's page (by hand, or the voice reaching the
 * page being read) has them follow again on their own.
 * "By hand" is Readium's word, not a guess: the reader reports a page the
 * user moved (a swipe, a key, an edge tap) apart from the ones the app moved
 * (`onNavigatedByUser`). The reader's own jumps (a chapter, a bookmark, a
 * highlight) are the user's too, and say so through `detach`.
 *
 * `initialLocator` is the sentence being heard as the reader opens, for it to
 * open on that page rather than on the saved place and then move.
 */
export function useReadAlong({
  bookId,
  readerRef,
  ready,
  tint,
}: {
  bookId: string | undefined;
  readerRef: React.RefObject<ReadiumViewRef | null>;
  /** Readium has said where it is, so it can be moved: still under the reader's cover, so the move is not seen. */
  ready: boolean;
  tint: string;
}) {
  const following = usePlayer((s) => !!bookId && selectBook(s)?.bookId === bookId);
  const loaded = usePlayer((s) => s.loaded);
  const isPlaying = usePlayer(selectPlaying);
  const working = usePlayerLoader();
  const sentenceId = useAudiobook((s) => s.sentenceId);
  const [initialLocator] = React.useState(() => (following ? (readAlongLocator() as Locator | null) : null));

  const section = following && sentenceId ? sectionOfId(sentenceId) : null;
  const chapter = useQuery(createChapterTextQueryOptions(bookId ?? '', section ?? -1, { enabled: section !== null })).data ?? null;
  const locator = React.useMemo(() => {
    const sentence = chapter?.sentences.find((x) => x.id === sentenceId);
    return chapter && sentence ? (sentenceLocator(chapter, chapter.paragraphs, sentence) as Locator) : null;
  }, [chapter, sentenceId]);

  const [detached, setDetached] = React.useState(false);
  /** The page on screen, as the reader last reported it. */
  const [page, setPage] = React.useState<Locator | null>(null);
  /** Which way BACK TO NOW goes: 1 the voice is further on, -1 further back, null not known yet. */
  const [voiceWay, setVoiceWay] = React.useState<-1 | 0 | 1 | null>(null);

  React.useEffect(() => {
    if (!following || !ready || !locator || detached) return;
    readerRef.current?.goTo(locator);
  }, [following, ready, locator, detached, readerRef]);

  const onLocationChange = React.useCallback((loc: Locator) => setPage(loc), []);

  // While off the voice's page, the page is asked about it whenever either
  // moves: back on it (swiped back, or the voice came to the page being read)
  // the pages follow again; else which way it is, from the page's first words,
  // since the voice can catch up with a page read ahead and pass it.
  React.useEffect(() => {
    if (!detached || !page) return undefined;
    let live = true;
    const reader = readerRef.current;
    void (async () => {
      const on = await reader?.evaluateJavaScript(VOICE_ON_SCREEN_SCRIPT);
      if (!live) return;
      if (on === 'on') {
        setDetached(false);
        return;
      }
      const text = await reader?.evaluateJavaScript(FIRST_VISIBLE_TEXT_SCRIPT);
      const way = await voiceDirectionFrom(page as never, text);
      if (live) setVoiceWay(way);
    })();
    return () => {
      live = false;
    };
  }, [detached, page, sentenceId, readerRef]);

  const detach = React.useCallback(() => setDetached(true), []);

  const decorations: DecorationGroup = React.useMemo(
    () => ({
      name: READ_ALONG_GROUP,
      decorations: following && locator ? [{ id: READ_ALONG_GROUP, locator, style: { type: 'highlight', tint } }] : [],
    }),
    [following, locator, tint],
  );

  return {
    following,
    initialLocator,
    decorations,
    onLocationChange,
    /** The user moved the page (Readium's `onNavigatedByUser`), or the reader jumped for them: stop following. */
    detach,
    /** The reader's read-aloud controls, driving the player. Shown once the book is in it, playing or paused. */
    controls: {
      active: following && loaded,
      isPlaying,
      working,
      onPlayPause: () => void togglePlayback(),
      onSkipPrevious: () => void skipSentence(-1),
      onSkipNext: () => void skipSentence(1),
      /** The read-aloud icon: stop listening, as it stops read-aloud anywhere in the reader. */
      onStop: () => void stopPlayback(),
    },
    /** The pages have stopped following the voice: back to it, or the voice to the page. */
    banner:
      following && detached
        ? {
            onBackToNow: () => setDetached(false),
            /** Where the voice is from the page: 1 further on, -1 further back, null not known yet. */
            voiceWay,
            onListenFromHere: async () => {
              const text = await readerRef.current?.evaluateJavaScript(FIRST_VISIBLE_TEXT_SCRIPT);
              setDetached(false);
              if (page) void playFromLocator(page as never, text);
            },
          }
        : null,
  };
}

export type ReadAlong = ReturnType<typeof useReadAlong>;
