import { useRouter } from 'expo-router';
import React from 'react';

import { useCatalogSearch } from '@/features/free-books/hooks/use-catalog-search';
import { useCatalogShelves } from '@/features/free-books/hooks/use-catalog-shelves';
import { useOpenFromLists } from '@/features/free-books/hooks/use-open-catalog-book';
import { usePageSearch } from '@/hooks/use-page-search';
import { backTo } from '@/navigation/navigate';
import type { CatalogBook } from '@/services/gutenberg/records';
import type { CatalogShelf } from '@/services/gutenberg/shelves';

/** What Explore shows under its search field. */
export type FreeBooksView = 'search' | 'shelves';

const NO_BOOKS: CatalogBook[] = [];

/**
 * The free books' Explore: Project Gutenberg's shelves, a search as typing
 * pauses, and opening any book either one shows.
 */
export function useFreeBooksExplore(landed: boolean) {
  const router = useRouter();
  const page = usePageSearch();
  // An emptied field is the shelves again at once, not after the pause.
  const query = page.query.trim() ? page.term : '';
  const { shelves, onDrawn } = useCatalogShelves(landed);
  const search = useCatalogSearch(query);

  const results = search.status === 'ready' ? search.books : NO_BOOKS;
  const lists = React.useMemo(
    () => [results, ...Object.values(shelves).map((shelf) => (shelf.status === 'ready' ? shelf.books : NO_BOOKS))],
    [results, shelves],
  );
  const openBook = useOpenFromLists(lists);

  const openShelf = React.useCallback(
    (shelf: CatalogShelf) => router.push({ pathname: '/free-books/shelf/[id]', params: { id: shelf.id } }),
    [router],
  );

  const term = query.trim();
  const view: FreeBooksView = term ? 'search' : 'shelves';
  const searchEmptyText =
    search.status === 'failed'
      ? 'Could not reach Project Gutenberg. Check your connection.'
      : search.status === 'ready'
        ? `No free books found for “${term}”.`
        : null;

  return {
    view,
    search: page,
    finding: search.status === 'loading',
    shelves,
    onDrawn,
    results,
    searchEmptyText,
    openBook,
    openShelf,
    close: () => backTo(router, '/'),
  };
}
