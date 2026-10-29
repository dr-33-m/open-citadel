import { useRouter } from 'expo-router';
import React from 'react';

import { useBookListSearch } from '@/features/library/hooks/use-book-list-search';
import type { BookSection } from '@/features/library/hooks/use-books-library';
import { useOpenReader } from '@/features/library/hooks/use-open-reader';
import { useDragOrder, type DragMove } from '@/hooks/use-drag-order';
import {
  useAllBooks,
  useArchivedBooks,
  useBooksStore,
  useCurrentlyReading,
  useFavoriteBooks,
  useQueuedBooks,
  useSyncRunning,
  type Book,
} from '@/stores/books';
import { countLabel } from '@/utils/format';

const TITLES: Record<Exclude<BookSection, 'collections'>, string> = {
  reading: 'Continue Reading',
  all: 'All Books',
  queue: 'Queue',
  favorites: 'Favorites',
  archived: 'Have Read',
};

const bookKey = (book: Book) => book.id;
/** After the book now above it, or first when there is none. */
const saveMove = ({ id, to, order }: DragMove) =>
  void useBooksStore.getState().reorderQueue([id], to === 0 ? { position: 'top' } : { afterId: order[to - 1] });

/**
 * A books shelf's "View all": the whole shelf, searchable, and its one action.
 * The queue is a list put in order by dragging (except while a search narrows
 * it), drawn as the podcasts' and blogs' queues are; the other shelves are a
 * grid of covers.
 */
export function useBookSection(type: string | undefined) {
  const router = useRouter();
  const openReader = useOpenReader();
  // The boolean, not the whole scan: this screen only tints one icon with it,
  // and the counters behind it change several times a second.
  const syncRunning = useSyncRunning();
  const reading = useCurrentlyReading();
  const all = useAllBooks();
  const queued = useQueuedBooks();
  const favorites = useFavoriteBooks();
  const archived = useArchivedBooks();

  const books = React.useMemo((): Book[] => {
    switch (type) {
      case 'reading':
        return reading;
      case 'all':
        return all;
      case 'queue':
        return queued;
      case 'favorites':
        return favorites;
      case 'archived':
        return archived;
      default:
        return [];
    }
  }, [type, reading, all, queued, favorites, archived]);
  const search = useBookListSearch(books);
  const queue = useDragOrder(search.results, bookKey, saveMove);

  const rescan = React.useCallback(() => void useBooksStore.getState().syncBooks(), []);
  const clearQueue = React.useCallback(() => void useBooksStore.getState().clearQueue(), []);
  const close = React.useCallback(() => router.back(), [router]);

  return {
    title: TITLES[type as keyof typeof TITLES] ?? 'Books',
    subtitle: countLabel(books.length, 'BOOK'),
    search,
    view: type === 'queue' ? ('queue' as const) : ('grid' as const),
    /** The queue as the drag list draws it. */
    queue: { data: queue.items, onReorder: queue.onReorder, dragEnabled: !search.query.trim() },
    emptyText: search.emptyText ?? 'Nothing here yet.',
    openReader,
    close,
    /** All Books can be rescanned; gold only while it is running. */
    rescan: type === 'all' ? { onPress: rescan, running: syncRunning } : null,
    clearQueue: type === 'queue' ? clearQueue : null,
  };
}
