import React from 'react';

import { useListen } from '@/features/audiobook/hooks/use-listen';
import { useOpenReader } from '@/features/library/hooks/use-open-reader';
import { useBooksStore, type Book } from '@/stores/books';
import { useCollectionsStore } from '@/stores/collections';
import { useSubscriptionStore } from '@/stores/subscription';

type BookSheetsOptions = {
  /** Offer "Add to collection" in the menu. Off inside a collection, which manages its own. */
  collections?: boolean;
  /** After a book is deleted, for a screen holding its own copy of the list. */
  onDeleted?: () => void;
};

const findBook = (bookId: string): Book | null =>
  useBooksStore.getState().books.find((b) => b.id === bookId) ?? null;

/**
 * A book's long-press menu and the sheets it leads to: add to a collection,
 * rename, delete. Every screen that shows books offers the same menu, and it
 * used to be wired three times over, once per screen, each copy drifting a
 * little from the others.
 *
 * Returns `openMenu` for the rows, and one prop group per sheet for
 * `BookSheets` to spread.
 */
export function useBookSheets({ collections: withCollections = true, onDeleted }: BookSheetsOptions = {}) {
  const openReader = useOpenReader();
  const collections = useCollectionsStore((s) => s.collections);
  const toggleFavorite = useBooksStore((s) => s.toggleFavorite);
  const updateBookStatus = useBooksStore((s) => s.updateBookStatus);
  const listen = useListen();
  const { listen: startListening } = listen;
  // Every plan reaches a cloud voice, so the padlock is simply "no plan".
  // Only once that is known: a plan still being checked is not drawn locked.
  const listenState = useSubscriptionStore((s): 'open' | 'locked' => (s.status === 'none' ? 'locked' : 'open'));

  const [menuBook, setMenuBook] = React.useState<Book | null>(null);
  const [deleting, setDeleting] = React.useState<Book | null>(null);
  const [renaming, setRenaming] = React.useState<Book | null>(null);
  const [picking, setPicking] = React.useState<string | null>(null);
  const [pickedIds, setPickedIds] = React.useState<string[]>([]);

  const closeMenu = React.useCallback(() => setMenuBook(null), []);
  const askDelete = React.useCallback((bookId: string) => setDeleting(findBook(bookId)), []);
  const askRename = React.useCallback((bookId: string) => setRenaming(findBook(bookId)), []);
  const onListen = React.useCallback(
    (bookId: string) => {
      const book = findBook(bookId);
      if (book) startListening(book);
    },
    [startListening],
  );
  const pickCollections = React.useCallback(async (bookId: string) => {
    setPickedIds(await useCollectionsStore.getState().getBookCollectionIds(bookId));
    setPicking(bookId);
  }, []);

  const toggleCollection = React.useCallback(
    async (collectionId: string, isAdded: boolean) => {
      if (!picking) return;
      const store = useCollectionsStore.getState();
      if (isAdded) await store.removeBookFromCollection(picking, collectionId);
      else await store.addBookToCollection(picking, collectionId);
      setPickedIds(await store.getBookCollectionIds(picking));
    },
    [picking],
  );
  const confirmDelete = React.useCallback(
    async (bookId: string) => {
      await useBooksStore.getState().deleteBook(bookId);
      setDeleting(null);
      onDeleted?.();
    },
    [onDeleted],
  );
  const saveTitle = React.useCallback(async (bookId: string, title: string) => {
    await useBooksStore.getState().updateBookTitle(bookId, title);
    setRenaming(null);
  }, []);

  return {
    openMenu: setMenuBook,
    menu: {
      visible: menuBook !== null,
      book: menuBook,
      onClose: closeMenu,
      onOpen: openReader,
      onToggleFavorite: toggleFavorite,
      onSetStatus: updateBookStatus,
      onAddToCollection: withCollections ? pickCollections : undefined,
      onDelete: askDelete,
      onEditTitle: askRename,
      listen: listenState,
      onListen,
    },
    listen,
    picker: withCollections
      ? {
          visible: picking !== null,
          collections,
          bookCollectionIds: pickedIds,
          onToggle: toggleCollection,
          onClose: () => setPicking(null),
        }
      : null,
    remove: {
      visible: deleting !== null,
      book: deleting,
      onClose: () => setDeleting(null),
      onConfirm: confirmDelete,
    },
    rename: {
      visible: renaming !== null,
      book: renaming,
      onClose: () => setRenaming(null),
      onSave: saveTitle,
    },
  };
}

export type BookSheetsState = ReturnType<typeof useBookSheets>;
