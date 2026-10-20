import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { highlights, notes } from '@/db/schema';
import { localDayString } from '@/utils/day';

/** The colour a highlight gets when none is chosen. */
export const DEFAULT_HIGHLIGHT_COLOR = '#f2ca50';

export type NewHighlight = {
  bookId: string;
  text: string;
  /** A Readium locator, stored as JSON. */
  locator: object;
  color?: string;
  chapter?: string | null;
  /** The text around it, `{ before, after }`, when the caller already has it. */
  context?: { before?: string; after?: string } | null;
  chatSessionId?: string | null;
};

/**
 * Keeps a highlight: the one way a row is written, for the reader, a chat's
 * suggestion and a podcast transcript alike, so the Timeline and Compass
 * read every highlight the same way whatever it was lifted from.
 */
export async function insertHighlight(highlight: NewHighlight): Promise<string> {
  // A random suffix alongside the timestamp avoids id collisions when two
  // highlights are created within the same millisecond.
  const id = `hl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  await db.insert(highlights).values({
    id,
    bookId: highlight.bookId,
    text: highlight.text,
    locator: JSON.stringify(highlight.locator),
    chapter: highlight.chapter ?? null,
    color: highlight.color || DEFAULT_HIGHLIGHT_COLOR,
    chatSessionId: highlight.chatSessionId ?? null,
    context: highlight.context ? JSON.stringify(highlight.context) : null,
    createdAt: now,
    createdDay: localDayString(new Date(now)),
  });
  return id;
}

/** Removes a highlight and the notes written on it. */
export async function deleteHighlight(id: string): Promise<void> {
  await db.delete(notes).where(eq(notes.highlightId, id));
  await db.delete(highlights).where(eq(highlights.id, id));
}
