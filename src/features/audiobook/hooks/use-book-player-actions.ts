import { useRouter } from 'expo-router';
import React from 'react';

import { useHighlightNow } from '@/features/audiobook/hooks/use-highlight-now';
import type { BookPlayerAction } from '@/features/audiobook/utils/player-menu';
import { readAlongLocator } from '@/services/audiobook';
import { stopPlayback } from '@/services/player';
import { useBooksStore } from '@/stores/books';
import type { BookNowPlaying } from '@/stores/player';

/**
 * What only a book's player does: its favourite, Highlight, and its menu
 * (read along in the book, where the voice hands over to the reader's
 * read-aloud at the sentence being heard, or stop listening).
 */
export function useBookPlayerActions(current: BookNowPlaying | null) {
  const router = useRouter();
  const highlight = useHighlightNow();
  const bookId = current?.bookId ?? null;

  const onMenu = React.useCallback(
    (action: BookPlayerAction) => {
      if (!bookId) return;
      if (action === 'stop') {
        void stopPlayback();
        return;
      }
      const locator = readAlongLocator();
      router.push({ pathname: '/reader/[id]', params: { id: bookId, ...(locator ? { locator: JSON.stringify(locator) } : {}) } } as never);
    },
    [bookId, router],
  );

  return {
    toggleFavorite: () => bookId && void useBooksStore.getState().toggleFavorite(bookId),
    highlight: () => void highlight(),
    onMenu,
  };
}
