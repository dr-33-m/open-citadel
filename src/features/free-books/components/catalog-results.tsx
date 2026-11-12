import React from 'react';

import { ListEmpty } from '@/components/list-empty';
import { TransitionFlashList } from '@/components/navigation/transition-scroll';
import { PageFade } from '@/components/scroll-fades';
import { LIST_DRAW_DISTANCE } from '@/constants/theme';
import { CatalogResultRow } from '@/features/free-books/components/catalog-result-row';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { CatalogBook } from '@/services/gutenberg/records';

const keyOf = (book: CatalogBook) => String(book.id);

type CatalogResultsProps = {
  results: CatalogBook[];
  emptyText: string | null;
  bottomPadding: number;
  onOpen: (id: number) => void;
};

/** What a search of Project Gutenberg's catalogue found: its first page. */
export function CatalogResults({ results, emptyText, bottomPadding, onOpen }: CatalogResultsProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  const renderItem = React.useCallback(
    ({ item }: { item: CatalogBook }) => <CatalogResultRow book={item} mutedForeground={muted} onPress={onOpen} />,
    [muted, onOpen],
  );
  return (
    <PageFade>
      <TransitionFlashList
        data={results}
        keyExtractor={keyOf}
        renderItem={renderItem}
        drawDistance={LIST_DRAW_DISTANCE}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<ListEmpty text={emptyText} />}
      />
    </PageFade>
  );
}
