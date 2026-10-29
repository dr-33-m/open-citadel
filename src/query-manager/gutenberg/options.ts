import type { InfiniteData, UseInfiniteQueryOptions, UseQueryOptions } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';
import { gutenbergKeys } from '@/query-manager/gutenberg/keys';
import { fetchBookDetail, fetchCatalogPage, searchCatalog } from '@/services/gutenberg/client';
import type { CatalogBookDetail, CatalogPage } from '@/services/gutenberg/records';
import type { CatalogShelf } from '@/services/gutenberg/shelves';

type Options<T, TData = T> = Omit<UseQueryOptions<T, Error, TData>, 'queryKey' | 'queryFn'>;

/*
 * The catalogue changes by the day (Samwell Cloud's Gutendex refreshes daily),
 * so an answer is fresh for a day and kept for two.
 */
const DAY = 24 * 60 * 60_000;

/**
 * A shelf, a page at a time. Explore's shelf draws the first page and "View
 * all" shares its cache entry, asking for the next page only when the reader
 * reaches the end of the last one.
 */
export function createShelfQueryOptions(
  shelf: CatalogShelf,
  options?: Omit<
    UseInfiniteQueryOptions<CatalogPage, Error, InfiniteData<CatalogPage>, readonly unknown[], number>,
    'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam'
  >,
) {
  return {
    staleTime: DAY,
    gcTime: 2 * DAY,
    ...options,
    queryKey: gutenbergKeys.shelf(shelf.id),
    queryFn: ({ pageParam, signal }) =>
      fetchCatalogPage({ topic: shelf.topic, sort: shelf.sort, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
  } satisfies UseInfiniteQueryOptions<CatalogPage, Error, InfiniteData<CatalogPage>, readonly unknown[], number>;
}

/**
 * A search inside one shelf, a page at a time like the shelf itself: words in
 * a title or an author's name, among that shelf's books, in its order. Kept
 * like a catalogue search, for half an hour.
 */
export function createShelfSearchQueryOptions(shelf: CatalogShelf, term: string) {
  return {
    staleTime: DAY,
    gcTime: 30 * 60_000,
    queryKey: gutenbergKeys.shelfSearch(shelf.id, term),
    queryFn: ({ pageParam, signal }) =>
      fetchCatalogPage({ topic: shelf.topic, sort: shelf.sort, search: term, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
  } satisfies UseInfiniteQueryOptions<CatalogPage, Error, InfiniteData<CatalogPage>, readonly unknown[], number>;
}

/** How many of a shelf's first page its row on Explore draws; "View all" has the rest. */
const SHELF_PREVIEW_SIZE = 12;

/**
 * The start of a shelf's first page, for its row on Explore. Read through the
 * shelf's own paged cache entry rather than fetched beside it, so the "View
 * all" that follows opens on what is already here instead of asking again.
 *
 * Only the books the row draws are held here: this is the entry kept across
 * launches (see `lib/query-persist-policy`), and the other twenty of the page
 * were being written to storage for a row that never shows them.
 */
export function createShelfPreviewQueryOptions(shelf: CatalogShelf, options?: Options<CatalogPage>) {
  return {
    staleTime: DAY,
    gcTime: 2 * DAY,
    ...options,
    queryKey: gutenbergKeys.shelfPreview(shelf.id),
    queryFn: async () => {
      const first = (await queryClient.fetchInfiniteQuery(createShelfQueryOptions(shelf))).pages[0];
      return { ...first, books: first.books.slice(0, SHELF_PREVIEW_SIZE) };
    },
  } satisfies UseQueryOptions<CatalogPage>;
}

/** One page of a search. Cancelled when a newer term replaces it. */
export function createCatalogSearchQueryOptions(term: string, options?: Options<CatalogPage>) {
  return {
    staleTime: DAY,
    gcTime: 30 * 60_000,
    ...options,
    queryKey: gutenbergKeys.search(term),
    queryFn: ({ signal }) => searchCatalog(term, signal),
  } satisfies UseQueryOptions<CatalogPage>;
}

/** A book's page: its summary, its rights and its file. */
export function createCatalogBookQueryOptions(id: number, options?: Options<CatalogBookDetail>) {
  return {
    staleTime: DAY,
    gcTime: 2 * DAY,
    ...options,
    queryKey: gutenbergKeys.book(id),
    queryFn: ({ signal }) => fetchBookDetail(id, signal),
  } satisfies UseQueryOptions<CatalogBookDetail>;
}
