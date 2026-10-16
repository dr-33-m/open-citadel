import { desc, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { books, readingProgress } from '@/db/schema';
import { bookTextDriver } from '@/services/book-text/driver';
import { reachedSections, readableExtent, WHOLE_BOOK, type ReadableExtent } from '@/services/book-text/extent';
import { ensureIndexed, warmIndex } from '@/services/book-text/indexer';
import { pickHits } from '@/services/book-text/pick-hits';
import { searchParagraphs } from '@/services/book-text/search';
import { indexedBookIds, sectionsOf, type SqlDriver, type StoredSection } from '@/services/book-text/store';
import type { SpineLocator } from '@/services/epub-spine';
import type { BookRow as Book } from '@/services/book-text/book-row';
import { ftsMatch, type SearchQuery } from '@/utils/search-terms';

/**
 * How far into a book Samwell may read: `null` for all of it (a finished
 * book, or a blog post, which has no plot to spoil), `undefined` for none
 * (no saved position: fail closed), or the reader's position.
 *
 * Only a finished book is whole. A book still in the queue, or set aside
 * partway, keeps its saved position as the boundary.
 */
export function readLocatorFor(book: Book): SpineLocator | null | undefined {
  if (isWhole(book)) return null;
  const progress = db.select({ locator: readingProgress.locator }).from(readingProgress).where(eq(readingProgress.bookId, book.id)).get();
  return parseLocator(progress?.locator);
}

const isWhole = (book: Book) => book.kind === 'article' || book.status === 'archived';

function parseLocator(locator: string | null | undefined): SpineLocator | undefined {
  if (!locator) return undefined;
  try {
    return JSON.parse(locator) as SpineLocator;
  } catch {
    return undefined;
  }
}

/** `readLocatorFor` for many books in one query, not one a book. */
function readLocatorsFor(list: readonly Book[]): Map<string, SpineLocator | null | undefined> {
  const partway = list.filter((book) => !isWhole(book));
  const saved = new Map<string, string | null>();
  if (partway.length > 0) {
    const rows = db.select({ bookId: readingProgress.bookId, locator: readingProgress.locator }).from(readingProgress).all();
    for (const row of rows) saved.set(row.bookId, row.locator);
  }
  return new Map(list.map((book) => [book.id, isWhole(book) ? null : parseLocator(saved.get(book.id))]));
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
  /** When nothing was found: titles of the chapters reached in the most recently read books searched, to try again from. */
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
  const indexed = await indexedBookIds(driver);
  const ready = options.books.filter((book) => indexed.has(book.id));
  const waiting = options.books.filter((book) => !indexed.has(book.id));
  const now = waiting.slice(0, options.indexNow);
  for (const book of now) if (await ensureIndexed(book)) ready.push(book);
  const later = waiting.slice(options.indexNow);
  if (later.length > 0) void warmIndex(later);

  // A finished book or a post is whole without its sections being read;
  // only a book still being read needs them, to place the reader in it.
  const locators = readLocatorsFor(ready);
  const extents = new Map<string, { book: Book; extent: ReadableExtent }>();
  for (const book of ready) {
    const locator = locators.get(book.id);
    if (locator === undefined) continue;
    const extent = locator === null ? WHOLE_BOOK : readableExtent(await sectionsOf(driver, book.id), locator);
    if (extent.lastSection >= 0) extents.set(book.id, { book, extent });
  }
  const result = { searched: extents.size, preparing: later.length };
  if (!match || extents.size === 0) return { hits: [], ...result, chapters: await chaptersOf(driver, extents) };

  const scopes = [...extents.values()].map(({ book, extent }) => ({ bookId: book.id, extent, section: options.section }));
  const found = await searchParagraphs(driver, match, scopes, options.limit * 4);
  const hits = pickHits(found, (bookId) => extents.get(bookId)?.extent, query, options).flatMap((hit) => {
    const book = extents.get(hit.bookId)?.book;
    return book ? [{ book, section: hit.section, sectionTitle: hit.sectionTitle, paragraph: hit.paragraph, text: hit.text }] : [];
  });
  return { hits, ...result, chapters: hits.length > 0 ? [] : await chaptersOf(driver, extents) };
}

/** Books whose chapters a search that found nothing hands back: the most recently read, which are what he is most likely after. */
const CHAPTER_BOOKS = 3;

/** Titles of the chapters reached in the first few books searched, for a search that found nothing to try again from. */
async function chaptersOf(driver: SqlDriver, extents: ReadonlyMap<string, { book: Book; extent: ReadableExtent }>): Promise<string[]> {
  const titles: string[] = [];
  for (const { book, extent } of [...extents.values()].slice(0, CHAPTER_BOOKS)) {
    for (const section of reachedSections(await sectionsOf(driver, book.id), extent)) if (section.title) titles.push(section.title);
  }
  return [...new Set(titles)];
}

/** The books an index warm-up should cover: what a search would look in. */
export function warmReadingIndex(): void {
  void warmIndex(readableBooks());
}
