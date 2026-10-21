/**
 * The book's text as the screens read it while it is heard, away from the
 * session that plays it: a chapter's paragraphs and sentences for the
 * follow-along sheet, and how much is left for the Listen sheet's figures.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { books } from '@/db/schema';
import { scriptSentences, type ScriptParagraph, type Sentence } from '@/features/audiobook/utils/sentences-of';
import { startPlace } from '@/features/audiobook/utils/start-place';
import { savedLocator } from '@/services/audiobook/position';
import { readCurrent } from '@/services/audiobook/settings';
import { bookTextDriver } from '@/services/book-text/driver';
import { ensureIndexed } from '@/services/book-text/indexer';
import { paragraphsOf, sectionsOf } from '@/services/book-text/store';

export interface ChapterText {
  index: number;
  title: string | null;
  paragraphs: ScriptParagraph[];
  sentences: Sentence[];
}

/** One section of a book, cut into the sentences the voice reads. */
export async function chapterText(bookId: string, index: number): Promise<ChapterText | null> {
  const driver = await bookTextDriver();
  const section = (await sectionsOf(driver, bookId)).find((s) => s.index === index);
  if (!section) return null;
  const paragraphs = await paragraphsOf(driver, bookId, index, 1, 1_000_000);
  return { index, title: section.title, paragraphs, sentences: scriptSentences(paragraphs) };
}

export interface ListenFigures {
  /** Characters still to be heard from where listening would start. */
  charsLeft: number;
}

/**
 * How much of a book is left to hear, from where Listen would start: the
 * sentence it was last heard at, or its saved place. Reads the book into the
 * index first if it must; null when its text cannot be read.
 */
export async function listenFigures(bookId: string): Promise<ListenFigures | null> {
  const row = db.select().from(books).where(eq(books.id, bookId)).get();
  if (!row || !(await ensureIndexed(row))) return null;
  const sections = (await sectionsOf(await bookTextDriver(), bookId)).filter((s) => s.chars > 0);
  const listened = sections.filter((s) => !s.frontMatter);
  const order = listened.length > 0 ? listened : sections;
  if (order.length === 0) return null;
  const remembered = readCurrent();
  const place =
    remembered?.bookId === bookId
      ? { section: Number.parseInt(remembered.sentenceId, 10), offset: 0 }
      : startPlace(order, savedLocator(bookId));
  if (!place) return null;
  let charsLeft = 0;
  for (const s of order) {
    if (s.index > place.section) charsLeft += s.chars;
    else if (s.index === place.section) charsLeft += Math.max(0, s.chars - place.offset);
  }
  return { charsLeft };
}
