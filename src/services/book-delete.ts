/**
 * book-delete.ts
 *
 * Shared helpers for deleting a book's data from the database and filesystem.
 * Used by both the books store (manual delete) and sync coordinator (stale cleanup).
 */

import { eq } from "drizzle-orm";
import {
  deleteAsync,
  StorageAccessFramework,
} from "expo-file-system/legacy";

import { db } from "@/db/client";
import {
  bookCollections,
  bookmarks,
  books,
  chatSessions,
  highlights,
  notes,
  readingProgress,
  syncItems,
} from "@/db/schema";

/**
 * Delete all database rows and the cached cover image for a book.
 * Does NOT delete the source EPUB file — use `deleteBookWithFile` for that.
 */
export async function deleteBookData(bookId: string): Promise<void> {
  // Look up the book first so we can clean up the cover file
  const rows = await db.select().from(books).where(eq(books.id, bookId));
  const book = rows[0];

  // Cascade delete related rows (no FK cascade constraints on most tables)
  await db.delete(bookCollections).where(eq(bookCollections.bookId, bookId));
  await db.delete(bookmarks).where(eq(bookmarks.bookId, bookId));
  await db.delete(notes).where(eq(notes.bookId, bookId));
  await db.delete(highlights).where(eq(highlights.bookId, bookId));
  await db.delete(readingProgress).where(eq(readingProgress.bookId, bookId));
  await db.delete(syncItems).where(eq(syncItems.bookId, bookId));

  // Chat sessions have onDelete: "set null", but clear explicitly for safety
  await db
    .update(chatSessions)
    .set({ bookId: null })
    .where(eq(chatSessions.bookId, bookId));

  // Delete the book row
  await db.delete(books).where(eq(books.id, bookId));

  // Clean up cached cover image
  if (book?.coverUrl) {
    try {
      await deleteAsync(book.coverUrl, { idempotent: true });
    } catch {
      // Cover file may already be gone — ignore
    }
  }
}

/**
 * Delete a book's data AND the source EPUB file from the phone.
 */
export async function deleteBookWithFile(bookId: string): Promise<void> {
  const rows = await db.select().from(books).where(eq(books.id, bookId));
  const book = rows[0];

  await deleteBookData(bookId);

  // Delete the actual EPUB file. Scheme-aware:
  //   content:// → Android SAF (references the file in place)
  //   file://    → iOS owned copy in app storage
  if (book?.filePath) {
    try {
      if (book.filePath.startsWith("content://")) {
        await StorageAccessFramework.deleteAsync(book.filePath);
      } else {
        await deleteAsync(book.filePath, { idempotent: true });
      }
    } catch {
      // File may already be gone — ignore
    }
  }
}
