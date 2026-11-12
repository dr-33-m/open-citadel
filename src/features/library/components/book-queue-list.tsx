import React from 'react';
import type { ReorderableListReorderEvent } from 'react-native-reorderable-list';

import { DragList } from '@/components/drag-list';
import { ListEmpty } from '@/components/list-empty';
import { Handover } from '@/components/navigation/handover';
import { RowSeparator } from '@/components/row-separator';
import { PageFade } from '@/components/scroll-fades';
import { layout } from '@/constants/theme';
import { BookListSkeleton } from '@/features/library/components/book-list-skeleton';
import { useBookRowRenderer } from '@/features/library/hooks/use-book-row-renderer';
import type { Book } from '@/stores/books';

const bookKey = (book: Book) => book.id;

type BookQueueListProps = {
  queue: { data: Book[]; onReorder: (event: ReorderableListReorderEvent) => void; dragEnabled: boolean };
  /** Whether the screen has landed; the list waits for it. */
  ready: boolean;
  emptyText: string;
  bottomInset: number;
  onOpen: (bookId: string) => void;
  onMenu: (book: Book) => void;
};

/**
 * The books queue's "View all": a list of rows, as the podcasts' and blogs'
 * queues are, put in order by their grips. `BookGrid`'s counterpart, held
 * behind a skeleton of its rows until the screen has settled in the same way.
 */
export function BookQueueList({ queue, ready, emptyText, bottomInset, onOpen, onMenu }: BookQueueListProps) {
  const renderBook = useBookRowRenderer({ onOpen, onMenu });
  const listStyle = React.useMemo(() => ({ paddingBottom: layout.scrollBottom + bottomInset }), [bottomInset]);

  return (
    <Handover ready={ready} skeleton={<BookListSkeleton />}>
      <PageFade>
        <DragList
          {...queue}
          host="page"
          keyExtractor={bookKey}
          renderItem={renderBook}
          ItemSeparatorComponent={RowSeparator}
          contentContainerStyle={listStyle}
          ListEmptyComponent={<ListEmpty text={emptyText} />}
        />
      </PageFade>
    </Handover>
  );
}
