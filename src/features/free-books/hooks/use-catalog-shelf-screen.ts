import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';

import { useOpenFromLists } from '@/features/free-books/hooks/use-open-catalog-book';
import { usePageSearch } from '@/hooks/use-page-search';
import { backTo } from '@/navigation/navigate';
import { createShelfQueryOptions, createShelfSearchQueryOptions } from '@/query-manager/gutenberg';
import { findShelf } from '@/services/gutenberg/shelves';

/** Long enough that a word is asked for once, not once a letter. Explore's pause. */
export const SHELF_SEARCH_DEBOUNCE = 450;

/**
 * A whole shelf, from its VIEW ALL. It opens on the page Explore already has
 * and asks for the next only when the reader reaches the end of the last one,
 * so nobody pays for pages they never scroll to.
 *
 * Its search goes to the catalogue rather than filtering what is loaded: a
 * shelf is hundreds of books, and the one being looked for is rarely on the
 * pages scrolled so far. The results page the same way the shelf does.
 */
export function useCatalogShelfScreen(param: string | undefined) {
  const router = useRouter();
  const shelf = findShelf(param);
  const search = usePageSearch();
  // An emptied field is the shelf again at once, not after the pause.
  const term = search.query.trim() ? search.term.trim() : '';
  const query = useInfiniteQuery({
    ...(term ? createShelfSearchQueryOptions(shelf, term) : createShelfQueryOptions(shelf)),
    // What was there stays until the answer comes, under the field's spinner,
    // rather than the grid emptying on every pause in typing.
    placeholderData: keepPreviousData,
  });
  const books = React.useMemo(() => query.data?.pages.flatMap((page) => page.books) ?? [], [query.data]);
  const lists = React.useMemo(() => [books], [books]);
  const open = useOpenFromLists(lists);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = React.useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const emptyText = query.isError
    ? 'Could not reach Project Gutenberg. Check your connection.'
    : term
      ? `No books on this shelf match “${term}”.`
      : 'Nothing on this shelf yet.';

  return {
    title: shelf.label,
    books,
    loading: query.isPending,
    loadingMore: isFetchingNextPage,
    emptyText,
    search,
    canSearch: !query.isPending,
    finding: query.isPlaceholderData,
    open,
    loadMore,
    back: () => backTo(router, '/free-books/explore'),
  };
}
