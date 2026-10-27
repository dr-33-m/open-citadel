import { asc, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { DEFAULT_HIGHLIGHT_COLOR } from '@/constants/highlights';
import { highlights, notes } from '@/db/schema';
import { localDayString } from '@/utils/day';

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

export type HighlightRow = typeof highlights.$inferSelect;

/** A book's highlights, newest first: what the reader's highlight list and menu take. */
export function listBookHighlights(bookId: string): HighlightRow[] {
  return db.select().from(highlights).where(eq(highlights.bookId, bookId)).orderBy(desc(highlights.createdAt)).all();
}

/** A highlight's colour, its tags (a JSON list) or the chat it opened. */
export async function updateHighlight(id: string, updates: { color?: string; tags?: string; chatSessionId?: string }): Promise<void> {
  await db.update(highlights).set(updates).where(eq(highlights.id, id));
}

export type HighlightNoteRow = typeof notes.$inferSelect;

/** The notes written on a highlight, oldest first. */
export function listHighlightNotes(highlightId: string): HighlightNoteRow[] {
  return db.select().from(notes).where(eq(notes.highlightId, highlightId)).orderBy(asc(notes.createdAt)).all();
}

/** Writes a note on a highlight. Returns the row as kept. */
export async function addHighlightNote(highlightId: string, bookId: string, text: string): Promise<HighlightNoteRow> {
  // A random suffix as for highlights: two notes in one millisecond (a tap
  // and a tool call) would otherwise share an id and the second fail.
  const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const row: HighlightNoteRow = { id, highlightId, bookId, text, createdAt: new Date().toISOString(), updatedAt: null };
  await db.insert(notes).values(row);
  return row;
}

/** Rewrites a note. Returns when it was changed. */
export async function updateHighlightNote(noteId: string, text: string): Promise<string> {
  const now = new Date().toISOString();
  await db.update(notes).set({ text, updatedAt: now }).where(eq(notes.id, noteId));
  return now;
}

export async function deleteHighlightNote(noteId: string): Promise<void> {
  await db.delete(notes).where(eq(notes.id, noteId));
}

/** Removes a highlight and the notes written on it. */
export async function deleteHighlight(id: string): Promise<void> {
  await db.delete(notes).where(eq(notes.highlightId, id));
  await db.delete(highlights).where(eq(highlights.id, id));
}
