import React from 'react';

import { FollowAlongSheet, FollowAlongTitle } from '@/components/follow-along/follow-along-sheet';
import { BookSentenceRow, type BookRowColors } from '@/features/audiobook/components/book-sentence-row';
import { BookTextSkeleton } from '@/features/audiobook/components/book-text-skeleton';
import type { BookTextState } from '@/features/audiobook/hooks/use-book-text';
import type { SentenceRow } from '@/features/audiobook/utils/sentence-rows';
import { FollowAlongTransport } from '@/features/podcasts/components/follow-along-transport';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type BookTextSheetProps = {
  visible: boolean;
  onClose: () => void;
  state: BookTextState;
};

const keyOf = (row: SentenceRow) => row.sentence.id;

/**
 * The book's text as it is heard, Spotify's lyrics for a book, in the
 * follow-along sheet: the chapter a sentence a row, the one being spoken
 * lit in gold, the scrubber and the transport pinned underneath.
 */
export function BookTextSheet({ visible, onClose, state }: BookTextSheetProps) {
  const tokens = useThemeTokens();
  const ink = tokens['--color-foreground'];
  const gold = tokens['--color-primary'];
  const colors = React.useMemo<BookRowColors>(() => ({ ink, gold }), [gold, ink]);
  const { lit, dim, marks, onSentence, onLongPress } = state;

  const renderItem = React.useCallback(
    ({ item }: { item: SentenceRow }) => (
      <BookSentenceRow
        row={item}
        lit={item.sentence.id === lit}
        dim={dim}
        mark={marks.get(item.sentence.id)?.color ?? null}
        colors={colors}
        onSentence={onSentence}
        onLongPress={onLongPress}
      />
    ),
    [colors, dim, lit, marks, onLongPress, onSentence],
  );
  const extra = React.useMemo(() => ({ lit, dim, marks }), [dim, lit, marks]);

  return (
    <FollowAlongSheet
      visible={visible}
      onClose={onClose}
      header={<FollowAlongTitle title={state.title} line={state.line} />}
      skeleton={<BookTextSkeleton />}
      loading={state.loading}
      list={{ data: state.rows, renderItem, keyExtractor: keyOf, extraData: extra, ...state.list }}
      listRef={state.listRef}
      showBackToNow={state.showBackToNow}
      onBackToNow={state.onBackToNow}
      footer={<FollowAlongTransport />}
    />
  );
}
