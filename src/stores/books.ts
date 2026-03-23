import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { books, appSettings } from '@/db/schema';
import { syncBooksFromDirectory } from '@/services/book-sync';

type Book = typeof books.$inferSelect;
export type BookStatus = 'reading' | 'queued' | 'archived' | 'favorite';

interface BooksState {
  books: Book[];
  booksDirectoryUri: string | null;
  isLoading: boolean;
  isSyncing: boolean;

  loadBooks: () => Promise<void>;
  loadDirectoryUri: () => Promise<void>;
  setDirectoryUri: (uri: string) => Promise<void>;
  syncBooks: () => Promise<void>;
  updateBookStatus: (bookId: string, status: BookStatus | null) => Promise<void>;
  clearQueue: () => Promise<void>;
  toggleFavorite: (bookId: string) => Promise<void>;
  updateBookMetadata: (
    bookId: string,
    metadata: { title?: string; author?: string; coverUrl?: string; totalPages?: number }
  ) => Promise<void>;
}

export const useBooksStore = create<BooksState>((set, get) => ({
  books: [],
  booksDirectoryUri: null,
  isLoading: false,
  isSyncing: false,

  loadBooks: async () => {
    set({ isLoading: true });
    const allBooks = await db.select().from(books);
    set({ books: allBooks, isLoading: false });
  },

  loadDirectoryUri: async () => {
    const result = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'booksDirectoryUri'));
    if (result.length > 0) {
      set({ booksDirectoryUri: result[0].value });
    }
  },

  setDirectoryUri: async (uri: string) => {
    await db
      .insert(appSettings)
      .values({ key: 'booksDirectoryUri', value: uri })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: uri },
      });
    set({ booksDirectoryUri: uri });
    await get().syncBooks();
  },

  syncBooks: async () => {
    const { booksDirectoryUri } = get();
    if (!booksDirectoryUri) return;

    set({ isSyncing: true });
    await syncBooksFromDirectory(booksDirectoryUri);
    await get().loadBooks();
    set({ isSyncing: false });
  },

  updateBookStatus: async (bookId: string, status: BookStatus | null) => {
    const updates: Record<string, unknown> = { status };
    if (status === 'archived') {
      updates.completedAt = new Date().toISOString();
    }
    await db.update(books).set(updates).where(eq(books.id, bookId));
    await get().loadBooks();
  },

  clearQueue: async () => {
    await db.update(books).set({ status: null }).where(eq(books.status, 'queued'));
    await get().loadBooks();
  },

  toggleFavorite: async (bookId: string) => {
    const book = get().books.find((b) => b.id === bookId);
    if (!book) return;
    const newValue = book.isFavorite === 1 ? 0 : 1;
    await db.update(books).set({ isFavorite: newValue }).where(eq(books.id, bookId));
    await get().loadBooks();
  },

  updateBookMetadata: async (bookId, metadata) => {
    await db.update(books).set(metadata).where(eq(books.id, bookId));
    await get().loadBooks();
  },
}));

// Selectors — useShallow prevents infinite re-renders from .filter() creating new arrays
export const useCurrentlyReading = () =>
  useBooksStore(useShallow((s) => s.books.filter((b) => b.status === 'reading')));
export const useQueuedBooks = () =>
  useBooksStore(useShallow((s) => s.books.filter((b) => b.status === 'queued')));
export const useArchivedBooks = () =>
  useBooksStore(useShallow((s) => s.books.filter((b) => b.status === 'archived')));
export const useFavoriteBooks = () =>
  useBooksStore(useShallow((s) => s.books.filter((b) => b.isFavorite === 1)));
export const useAllBooks = () =>
  useBooksStore(useShallow((s) => s.books));
