import { useRouter } from 'expo-router';
import React from 'react';

import { useHighlightNow } from '@/features/audiobook/hooks/use-highlight-now';
import type { BookPlayerAction } from '@/features/audiobook/utils/player-menu';
import { stopPlayback } from '@/services/player';
import type { BookNowPlaying } from '@/stores/player';

/**
 * What only a book's player does: Highlight, and its menu
 * (read along in the book, which opens on the sentence being heard and
 * follows the voice, or stop listening).
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
      // No place to jump to: the reader opens on the sentence being heard itself
      // (`useReadAlong`), so it is not a jump with a way back to the saved place.
      router.push({ pathname: '/reader/[id]', params: { id: bookId } });
    },
    [bookId, router],
  );

  return {
    highlight: () => void highlight(),
    onMenu,
  };
}
