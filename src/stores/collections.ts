import { create } from 'zustand';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { bookCollections, books, collections } from '@/db/schema';

type Collection = typeof collections.$inferSelect;
type Book = typeof books.$inferSelect;
export type CollectionWithCount = Collection & { count: number };

interface CollectionsState {
  collections: CollectionWithCount[];
  isLoading: boolean;

  loadCollections: () => Promise<void>;
  createCollection: (name: string) => Promise<string>;
  deleteCollection: (id: string) => Promise<void>;
  addBookToCollection: (bookId: string, collectionId: string) => Promise<void>;
  removeBookFromCollection: (bookId: string, collectionId: string) => Promise<void>;
  getCollectionBooks: (collectionId: string) => Promise<Book[]>;
  getBookCollectionIds: (bookId: string) => Promise<string[]>;
}

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  isLoading: false,

  loadCollections: async () => {
    set({ isLoading: true });

    const allCollections = await db.select().from(collections);

    const withCounts: CollectionWithCount[] = await Promise.all(
      allCollections.map(async (col) => {
        const [result] = await db
          .select({ count: sql<number>`count(*)` })
          .from(bookCollections)
          .where(eq(bookCollections.collectionId, col.id));
        return { ...col, count: result?.count ?? 0 };
      })
    );

    set({ collections: withCounts, isLoading: false });
  },

  createCollection: async (name: string) => {
    const id = `col-${Date.now()}`;
    const now = new Date().toISOString();

    await db.insert(collections).values({
      id,
      name,
      createdAt: now,
    });

    await get().loadCollections();
    return id;
  },

  deleteCollection: async (id: string) => {
    // Remove all book associations first
    await db.delete(bookCollections).where(eq(bookCollections.collectionId, id));
    await db.delete(collections).where(eq(collections.id, id));
    await get().loadCollections();
  },

  addBookToCollection: async (bookId: string, collectionId: string) => {
    // Prevent duplicates
    const [existing] = await db
      .select()
      .from(bookCollections)
      .where(
        and(
          eq(bookCollections.bookId, bookId),
          eq(bookCollections.collectionId, collectionId)
        )
      );
    if (existing) return;

    await db.insert(bookCollections).values({ bookId, collectionId });
    await get().loadCollections();
  },

  removeBookFromCollection: async (bookId: string, collectionId: string) => {
    await db
      .delete(bookCollections)
      .where(
        and(
          eq(bookCollections.bookId, bookId),
          eq(bookCollections.collectionId, collectionId)
        )
      );
    await get().loadCollections();
  },

  getCollectionBooks: async (collectionId: string) => {
    const rows = await db
      .select({ book: books })
      .from(bookCollections)
      .innerJoin(books, eq(bookCollections.bookId, books.id))
      .where(eq(bookCollections.collectionId, collectionId));
    return rows.map((r) => r.book);
  },

  getBookCollectionIds: async (bookId: string) => {
    const rows = await db
      .select({ collectionId: bookCollections.collectionId })
      .from(bookCollections)
      .where(eq(bookCollections.bookId, bookId));
    return rows.map((r) => r.collectionId);
  },
}));
