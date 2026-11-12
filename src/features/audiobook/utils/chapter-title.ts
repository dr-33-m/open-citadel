/**
 * A chapter's title as worth showing: many EPUBs title every file with the
 * book's own name, and "Moby-Dick" under "Moby-Dick" says nothing. Null for
 * one with no title, or the book's.
 *
 * Pure, so it can be tested on its own.
 */
const squeeze = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

export function chapterTitle(title: string | null | undefined, bookTitle: string): string | null {
  if (!title?.trim()) return null;
  return squeeze(title) === squeeze(bookTitle) ? null : title.trim();
}
