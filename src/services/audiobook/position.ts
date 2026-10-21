/**
 * Listening moves the book's saved place: opening the book lands where the
 * audio stopped, the Library's bar follows, Samwell's spoiler line follows
 * what was heard, and a day spent listening dots the Timeline as a day spent
 * reading does. All through `saveReadingPosition`, the reader's own write.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { readingProgress } from '@/db/schema';
import { bookFraction, placeLocator } from '@/features/audiobook/utils/sentence-locator';
import type { Sentence } from '@/features/audiobook/utils/sentences-of';
import { current, placeSentence, type BookSession } from '@/services/audiobook/session';
import { writeCurrent } from '@/services/audiobook/settings';
import type { SpineLocator } from '@/services/epub-spine';
import { saveReadingPosition } from '@/services/reading-position';

/** Saves on a sentence change at most this often; a pause or a stop always saves. */
const SAVE_EVERY_MS = 5_000;

/** The book's saved place, whatever wrote it, or null for a book never opened or heard. */
export function savedLocator(bookId: string): SpineLocator | null {
  const row = db.select({ locator: readingProgress.locator }).from(readingProgress).where(eq(readingProgress.bookId, bookId)).get();
  if (!row?.locator) return null;
  try {
    return JSON.parse(row.locator) as SpineLocator;
  } catch {
    return null;
  }
}

/** How far through the book a sentence is, by characters. */
export function fractionAt(s: BookSession, sentence: Sentence): number {
  return bookFraction(s.script.sections, sentence.section, sentence.offset);
}

/** Saves the place: now (`force`), or if the last save was a while ago. */
export async function saveBookPlace(s: BookSession, force = false): Promise<void> {
  const sentence = placeSentence(s);
  if (!sentence) return;
  const now = Date.now();
  if (!force && now - s.lastSavedAt < SAVE_EVERY_MS) return;
  s.lastSavedAt = now;
  const section = s.script.section(sentence.section);
  if (!section) return;
  writeCurrent({ bookId: s.info.id, sentenceId: sentence.id });
  const fraction = fractionAt(s, sentence);
  await saveReadingPosition(s.info.id, { ...placeLocator(section, sentence, fraction) }, fraction);
}

/** Where the voice is, as the reader opens on it: for reading along in the book, and the handover to read-aloud. */
export function readAlongLocator(): ReturnType<typeof placeLocator> | null {
  const s = current();
  const sentence = s ? placeSentence(s) : null;
  const section = s && sentence ? s.script.section(sentence.section) : null;
  if (!s || !sentence || !section) return null;
  return placeLocator(section, sentence, fractionAt(s, sentence));
}
