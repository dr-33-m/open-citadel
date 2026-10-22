import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { books, chatSuggestions, highlights } from '@/db/schema';
import { locatePassage } from '@/services/book-text/locate-passage';

/** Lowercased with whitespace collapsed: enough to tell a locator's text from a different passage. */
const squash = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Moves the highlights Samwell suggested to where their passages are.
 *
 * Until the suggestion learned to find its passage, an approved one was
 * saved at the reader's position at the time, so the book never drew it. Its
 * text was right and its place was not; this finds the place. Only those made
 * from a suggestion are looked at, and only when the text the locator would
 * draw is not the highlight's own. Resolves true when any was moved.
 */
export async function repairSuggestedHighlights(bookId: string): Promise<boolean> {
  const suggested = db
    .select({ id: highlights.id, text: highlights.text, locator: highlights.locator })
    .from(highlights)
    .innerJoin(chatSuggestions, eq(chatSuggestions.resultEntryId, highlights.id))
    .where(and(eq(highlights.bookId, bookId), eq(chatSuggestions.kind, 'highlight')))
    .all();
  const misplaced = suggested.filter((row) => !drawsItsOwnText(row.locator, row.text));
  if (misplaced.length === 0) return false;

  const book = db.select().from(books).where(eq(books.id, bookId)).get();
  if (!book) return false;
  let moved = false;
  for (const row of misplaced) {
    const located = await locatePassage(book, row.text);
    if ('error' in located) continue;
    db.update(highlights)
      // The context was read around the wrong place; cleared, it is read again when next wanted.
      .set({ text: located.text, locator: JSON.stringify(located.locator), context: null })
      .where(eq(highlights.id, row.id))
      .run();
    moved = true;
  }
  return moved;
}

function drawsItsOwnText(locator: string | null, text: string): boolean {
  if (!locator) return false;
  try {
    const drawn = (JSON.parse(locator) as { text?: { highlight?: string } }).text?.highlight;
    return !!drawn && squash(drawn) === squash(text);
  } catch {
    return false;
  }
}
