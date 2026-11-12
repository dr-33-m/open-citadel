import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';

import { useBookListSearch } from '@/features/library/hooks/use-book-list-search';
import { useOpenReader } from '@/features/library/hooks/use-open-reader';
import { useSettledFocusEffect } from '@/navigation/use-settled-focus-effect';
import { createCollectionBooksQueryOptions, libraryKeys } from '@/query-manager/library';
import { useAllBooks, useBooksStore, type Book } from '@/stores/books';
import { useCollectionsStore } from '@/stores/collections';
import { countLabel } from '@/utils/format';

const NO_BOOKS: Book[] = [];

/** One collection: its books, searchable, and adding, removing and deleting. */
export function useCollectionScreen(id: string | undefined) {
  const router = useRouter();
  const openReader = useOpenReader();
  const allBooks = useAllBooks();
  const collection = useCollectionsStore((s) => s.collections.find((c) => c.id === id));
  const queryClient = useQueryClient();
  const booksQuery = useQuery(createCollectionBooksQueryOptions(id ?? '', { enabled: !!id }));
  const books = booksQuery.data ?? NO_BOOKS;
  const [adding, setAdding] = React.useState(false);
  const search = useBookListSearch(books);

  const reload = React.useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({ queryKey: libraryKeys.collectionBooks(id) });
  }, [id, queryClient]);

  // Coming back (from the reader, say): every book into the store, then this
  // collection's, once the screen on top has finished leaving. Not on the
  // first focus: the query reads the collection as it mounts.
  useSettledFocusEffect(
    () => {
      void useBooksStore.getState().loadBooks().then(reload);
      void useCollectionsStore.getState().loadCollections();
    },
    { skipFirst: true },
  );

  const deleteCollection = React.useCallback(async () => {
    if (!id) return;
    await useCollectionsStore.getState().deleteCollection(id);
    router.back();
  }, [id, router]);

  /** The picker hands back the whole selection; add what is new, remove what was dropped. */
  const saveSelection = React.useCallback(
    async (selectedIds: string[]) => {
      if (!id) return;
      const store = useCollectionsStore.getState();
      const existing = new Set(books.map((b) => b.id));
      const selected = new Set(selectedIds);
      for (const bookId of selected) if (!existing.has(bookId)) await store.addBookToCollection(bookId, id);
      for (const bookId of existing) if (!selected.has(bookId)) await store.removeBookFromCollection(bookId, id);
      await reload();
    },
    [books, id, reload],
  );
  const existingIds = React.useMemo(() => books.map((b) => b.id), [books]);
  const close = React.useCallback(() => router.back(), [router]);
  const openAddBooks = React.useCallback(() => setAdding(true), []);
  const closeAddBooks = React.useCallback(() => setAdding(false), []);

  return {
    title: collection?.name ?? 'Collection',
    /** Its books were cached from an earlier visit, so the grid can draw at once. */
    loaded: booksQuery.data !== undefined,
    subtitle: countLabel(books.length, 'BOOK'),
    search,
    canSearch: books.length > 0,
    emptyText: search.emptyText ?? 'No books in this collection yet.',
    reload,
    openReader,
    close,
    deleteCollection,
    openAddBooks,
    addBooks: { visible: adding, allBooks, existingBookIds: existingIds, onConfirm: saveSelection, onClose: closeAddBooks },
  };
}
