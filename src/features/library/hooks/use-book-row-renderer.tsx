import React from 'react';

import { BookRow } from '@/features/library/components/book-row';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Book } from '@/stores/books';

type RowHandlers = {
  onOpen: (bookId: string) => void;
  onMenu: (book: Book) => void;
};

/**
 * A list's `renderItem` for book rows, wired the same way wherever books are
 * listed. Stable across renders, so recycled rows keep their memo.
 */
export function useBookRowRenderer({ onOpen, onMenu }: RowHandlers) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const tertiary = tokens['--color-surface-tertiary'];
  return React.useCallback(
    ({ item }: { item: Book }) => (
      <BookRow book={item} mutedForeground={muted} surfaceTertiary={tertiary} onPress={onOpen} onMenu={onMenu} />
    ),
    [muted, onMenu, onOpen, tertiary],
  );
}
