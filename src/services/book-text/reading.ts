import { desc, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { books, readingProgress } from '@/db/schema';
import { bookTextDriver } from '@/services/book-text/driver';
import { reachedSections, readableExtent, readablePart, type ReadableExtent } from '@/services/book-text/extent';
import { ensureIndexed, warmIndex } from '@/services/book-text/indexer';
import { indexedFingerprint, searchParagraphs, sectionsOf, type StoredSection } from '@/services/book-text/store';
import type { SpineLocator } from '@/services/epub-spine';
import type { BookRow as Book } from '@/services/book-text/book-row';
import { excerptAround, ftsMatch, matchScore, type SearchQuery } from '@/utils/search-terms';

/**
 * How far into a book Samwell may read: `null` for all of it (a finished
 * book, or a blog post, which has no plot to spoil), `undefined` for none
 * (no saved position: fail closed), or the reader's position.
 *
 * Only a finished book is whole. A book still in the queue, or set aside
 * partway, keeps its saved position as the boundary.
 */
export function readLocatorFor(book: Book): SpineLocator | null | undefined {
  if (book.kind === 'article' || book.status === 'archived') return null;
  const progress = db.select({ locator: readingProgress.locator }).from(readingProgress).where(eq(readingProgress.bookId, book.id)).get();
  if (!progress?.locator) return undefined;
  try {
    return JSON.parse(progress.locator) as SpineLocator;
  } catch {
    return undefined;
  }
}

/**
 * Every book and post with something in it the reader has read: being read,
 * finished, set aside with a position, or a post opened in the reader. Most
 * recently read first, which is the order the index fills in and the order a
 * search reaches for when it cannot wait for them all.
 */
export function readableBooks(): Book[] {
  const opened = db.select({ bookId: readingProgress.bookId }).from(readingProgress);
  return db
    .select()
    .from(books)
    .where(or(inArray(books.status, ['reading', 'archived']), eq(books.kind, 'article'), inArray(books.id, opened)))
    .orderBy(desc(sql`coalesce((select ${readingProgress.updatedAt} from ${readingProgress} where ${readingProgress.bookId} = ${books.id}), ${books.completedAt}, ${books.addedAt})`))
    .all()
    .filter((book) => book.filePath != null);
}

/** A book's sections and how far into them the reader has got, indexing it first if it must. */
export async function bookExtent(book: Book): Promise<{ sections: StoredSection[]; extent: ReadableExtent } | null> {
  if (!(await ensureIndexed(book))) return null;
  const sections = await sectionsOf(await bookTextDriver(), book.id);
  return { sections, extent: readableExtent(sections, readLocatorFor(book)) };
}

/** A paragraph a search found, cut at the reader's position and to a readable length. */
export interface PassageHit {
  book: Book;
  section: number;
  sectionTitle: string | null;
  /** Its number in the section, from 1: what `read_chapter` picks up from. */
  paragraph: number;
  text: string;
}

export interface PassageSearch {
  hits: PassageHit[];
  /** Books searched. */
  searched: number;
  /** Books left out because they are still being prepared for search, in the background. */
  preparing: number;
  /** Titles of the sections searched, for a search that found nothing to try again from. */
  chapters: string[];
}

export interface PassageSearchOptions {
  books: readonly Book[];
  /** Only this section, by spine index. */
  section?: number;
  limit: number;
  perBook: number;
  excerptChars: number;
  /** How many books not yet indexed are read now; the rest are indexed in the background. */
  indexNow: number;
}

/**
 * Searches the read text of these books, best passages first, never past the
 * reader in any of them. Books already indexed answer at once; up to
 * `indexNow` that are not are read first, and the rest are left to the
 * background so a search over a large library is never a long wait.
 */
export async function searchPassages(query: SearchQuery, options: PassageSearchOptions): Promise<PassageSearch> {
  const match = ftsMatch(query);
  const driver = await bookTextDriver();
  const ready: Book[] = [];
  const waiting: Book[] = [];
  for (const book of options.books) {
    if ((await indexedFingerprint(driver, book.id)) !== null) ready.push(book);
    else waiting.push(book);
  }
  const now = waiting.slice(0, options.indexNow);
  for (const book of now) if (await ensureIndexed(book)) ready.push(book);
  const later = waiting.slice(options.indexNow);
  if (later.length > 0) void warmIndex(later);

  const extents = new Map<string, { book: Book; sections: StoredSection[]; extent: ReadableExtent }>();
  for (const book of ready) {
    const sections = await sectionsOf(driver, book.id);
    const extent = readableExtent(sections, readLocatorFor(book));
    if (extent.lastSection >= 0) extents.set(book.id, { book, sections, extent });
  }
  const chapters = [...extents.values()].flatMap(({ sections, extent }) =>
    reachedSections(sections, extent).flatMap((section) => (section.title ? [section.title] : [])),
  );
  const result = { searched: extents.size, preparing: later.length, chapters: [...new Set(chapters)] };
  if (!match || extents.size === 0) return { hits: [], ...result };

  const scopes = [...extents.values()].map(({ book, extent }) => ({ bookId: book.id, extent, section: options.section }));
  const found = await searchParagraphs(driver, match, scopes, options.limit * 4);
  const perBook = new Map<string, number>();
  const hits: PassageHit[] = [];
  for (const hit of found) {
    if (hits.length >= options.limit) break;
    const entry = extents.get(hit.bookId);
    if (!entry || (perBook.get(hit.bookId) ?? 0) >= options.perBook) continue;
    const text = readablePart(entry.extent, hit.section, hit.start, hit.text);
    // Cut at the reader's position, the words that matched may be on the far side of it.
    if (!text || matchScore(text, query) === 0) continue;
    perBook.set(hit.bookId, (perBook.get(hit.bookId) ?? 0) + 1);
    hits.push({
      book: entry.book,
      section: hit.section,
      sectionTitle: hit.sectionTitle,
      paragraph: hit.n,
      text: excerptAround(text, query, options.excerptChars),
    });
  }
  return { hits, ...result };
}

/** The books an index warm-up should cover: what a search would look in. */
export function warmReadingIndex(): void {
  void warmIndex(readableBooks());
}
