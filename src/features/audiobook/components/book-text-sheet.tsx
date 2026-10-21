import React from 'react';

import { FollowAlongSheet, FollowAlongTitle } from '@/components/follow-along/follow-along-sheet';
import { BookParagraphRow, type BookRowColors } from '@/features/audiobook/components/book-paragraph-row';
import { BookTextSkeleton } from '@/features/audiobook/components/book-text-skeleton';
import type { BookTextState } from '@/features/audiobook/hooks/use-book-text';
import type { ParagraphRow } from '@/features/audiobook/utils/paragraph-rows';
import { FollowAlongTransport } from '@/features/podcasts/components/follow-along-transport';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type BookTextSheetProps = {
  visible: boolean;
  onClose: () => void;
  state: BookTextState;
};

const keyOf = (row: ParagraphRow) => row.key;

/**
 * The book's text as it is heard, Spotify's lyrics for a book, in the
 * follow-along sheet: the chapter's paragraphs, the sentence being spoken
 * lit in gold, the scrubber and the transport pinned underneath.
 */
export function BookTextSheet({ visible, onClose, state }: BookTextSheetProps) {
  const tokens = useThemeTokens();
  const ink = tokens['--color-foreground'];
  const gold = tokens['--color-primary'];
  const colors = React.useMemo<BookRowColors>(() => ({ ink, gold }), [gold, ink]);
  const { lit, dim, onSentence } = state;

  const renderItem = React.useCallback(
    ({ item }: { item: ParagraphRow }) => (
      <BookParagraphRow
        row={item}
        lit={lit && item.sentences.some((s) => s.id === lit) ? lit : null}
        dim={dim}
        colors={colors}
        onSentence={onSentence}
      />
    ),
    [colors, dim, lit, onSentence],
  );
  const extra = React.useMemo(() => ({ lit, dim }), [dim, lit]);

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
