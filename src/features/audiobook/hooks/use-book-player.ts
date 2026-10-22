import React from 'react';

import { usePlayerState } from '@/features/podcasts/hooks/use-player-state';
import { useHeld } from '@/hooks/use-held';
import { timeLeftLabel } from '@/features/audiobook/utils/listen-estimate';
import { sectionOfId } from '@/features/audiobook/utils/sentences-of';
import { bookChapters, bookClockNow, type BookChapter } from '@/services/audiobook';
import { selectSentenceHighlighted, useAudiobook } from '@/stores/audiobook';
import { useBooksStore } from '@/stores/books';
import { selectBook, usePlayer } from '@/stores/player';

const NO_CHAPTERS: BookChapter[] = [];

/**
 * Everything the full player draws for a book: the player's own state
 * (`usePlayerState`, whose clock is the whole book's at the listener's speed),
 * the chapter being heard, the chapters on the book's clock, the time left in
 * words, whether the sentence being heard is highlighted, and the book as the
 * Library keeps it (for its favourite).
 *
 * The chapters and the time left are worked out again as each sentence
 * starts, and only once the player has landed: nothing is asked of the book
 * while the player is still opening.
 */
export function useBookPlayer(landed: boolean) {
  // Held: the player keeps drawing the book while it goes back down after a stop.
  const current = useHeld(usePlayer(selectBook));
  const state = usePlayerState(landed);
  const sentenceId = useAudiobook((s) => s.sentenceId);
  const highlighted = useAudiobook(selectSentenceHighlighted);
  const preparing = useAudiobook((s) => s.preparing);
  const version = useAudiobook((s) => s.timelineVersion);
  const bookId = current?.bookId ?? null;
  const favorite = useBooksStore((s) => (bookId ? s.books.find((b) => b.id === bookId)?.isFavorite === 1 : false));

  const chapters = React.useMemo(
    () => (landed && bookId ? bookChapters() : NO_CHAPTERS),
    // The chapters move as sentences are measured and the speed changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [landed, bookId, version, state.speed],
  );
  const timeLeft = React.useMemo(() => {
    if (!landed || !bookId) return null;
    const { position, duration } = bookClockNow();
    return timeLeftLabel(duration - position) || null;
    // Once a sentence: the label is in minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed, bookId, sentenceId, version, state.speed]);
  const section = sentenceId ? sectionOfId(sentenceId) : null;

  return {
    ...state,
    current,
    favorite,
    highlighted,
    preparing,
    chapters,
    currentChapterId: section !== null ? String(section) : null,
    timeLeft,
    speedLine: 'Applies to every book, heard or read aloud.',
  };
}

export type BookPlayerState = ReturnType<typeof useBookPlayer>;
