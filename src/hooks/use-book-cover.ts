import { eq } from 'drizzle-orm';
import React from 'react';

import { db } from '@/db/client';
import { books } from '@/db/schema';

/** A `books` row's cover: a post's picture, an episode's artwork. Null for none, or no row. */
export function useBookCover(bookId: string | null): string | null {
  return React.useMemo(() => {
    if (!bookId) return null;
    return db.select({ coverUrl: books.coverUrl }).from(books).where(eq(books.id, bookId)).get()?.coverUrl ?? null;
  }, [bookId]);
}
