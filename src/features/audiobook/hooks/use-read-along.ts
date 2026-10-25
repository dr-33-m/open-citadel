import type { DecorationGroup, Locator, ReadiumViewRef } from '@dr33m/react-native-readium';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { sectionOfId } from '@/features/audiobook/utils/sentences-of';
import { createChapterTextQueryOptions } from '@/query-manager/audiobook';
import { playFromLocator, readAlongLocator, sentenceLocator, skipSentence } from '@/services/audiobook';
import { togglePlayback } from '@/services/player';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook, selectPlaying, usePlayer, usePlayerLoader } from '@/stores/player';

/**
 * A page turned within this long of the reader being moved to the voice is
 * that move landing (Readium reports a page or two as it settles), not the
 * reader turning it.
 */
const OWN_TURN_MS = 1_200;

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
 * BACK TO NOW brings them back, LISTEN FROM HERE moves the voice to the page.
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
  /** The book is laid out and can be moved about. */
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
  const movedAt = React.useRef(0);
  const landedAt = React.useRef<number | undefined>(undefined);
  const onPage = React.useRef<Locator | null>(null);

  React.useEffect(() => {
    if (!following || !ready || !locator || detached) return;
    movedAt.current = Date.now();
    readerRef.current?.goTo(locator);
  }, [following, ready, locator, detached, readerRef]);

  const onLocationChange = React.useCallback(
    (loc: Locator) => {
      onPage.current = loc;
      if (!following) return;
      const position = loc.locations?.position;
      if (Date.now() - movedAt.current < OWN_TURN_MS) {
        landedAt.current = position;
        return;
      }
      if (movedAt.current > 0 && position !== landedAt.current) setDetached(true);
    },
    [following],
  );

  const decorations: DecorationGroup = React.useMemo(
    () => ({
      name: 'read-along',
      decorations: following && locator ? [{ id: 'read-along', locator, style: { type: 'highlight', tint } }] : [],
    }),
    [following, locator, tint],
  );

  return {
    following,
    initialLocator,
    decorations,
    onLocationChange,
    /** The reader's read-aloud controls, driving the player. Shown once the book is in it, playing or paused. */
    controls: {
      active: following && loaded,
      isPlaying,
      working,
      onPlayPause: () => void togglePlayback(),
      onSkipPrevious: () => void skipSentence(-1),
      onSkipNext: () => void skipSentence(1),
    },
    /** The pages have stopped following the voice: back to it, or the voice to the page. */
    banner:
      following && detached
        ? {
            onBackToNow: () => setDetached(false),
            onListenFromHere: () => {
              setDetached(false);
              if (onPage.current) void playFromLocator(onPage.current as never);
            },
          }
        : null,
  };
}

export type ReadAlong = ReturnType<typeof useReadAlong>;
