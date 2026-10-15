/**
 * The library as Samwell's tools read it: every book, found by name.
 *
 * One read of the books, their progress and their collections serves every
 * lookup, and one resolver decides which book a name means for every tool
 * that acts on one (`resolveLibraryBook`), so "which book did he mean" is
 * decided in one place. See `utils/book-match.ts` for the rules.
 */
import { count, eq, inArray } from 'drizzle-orm';

import { db } from '@/db/client';
import { bookCollections, books, collections, highlights, notes, readingProgress } from '@/db/schema';
import { readBookPackageInfo } from '@/services/book-context';
import {
  libraryStatus,
  type BookDetails,
  type CollectionListing,
  type LibraryBook,
  type LibraryStatus,
} from '@/services/library-format';
import { SEARCH_LIMITS, type ToolRuntime } from '@/services/tool-limits';
import { rankBooks, resolveTitle } from '@/utils/book-match';

type BookRow = typeof books.$inferSelect;

/** Every book (not blog posts) with where the reader is and the collections holding it. */
export function loadLibrary(): LibraryBook[] {
  const rows = db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      category: books.category,
      status: books.status,
      isFavorite: books.isFavorite,
      addedAt: books.addedAt,
      completedAt: books.completedAt,
      percentage: readingProgress.percentage,
    })
    .from(books)
    .leftJoin(readingProgress, eq(readingProgress.bookId, books.id))
    .where(eq(books.kind, 'book'))
    .all();
  const memberships = db
    .select({ bookId: bookCollections.bookId, name: collections.name })
    .from(bookCollections)
    .innerJoin(collections, eq(collections.id, bookCollections.collectionId))
    .all();
  const held = new Map<string, string[]>();
  for (const { bookId, name } of memberships) held.set(bookId, [...(held.get(bookId) ?? []), name]);

  // One row a book, even if an old install left two progress rows for one.
  const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
  return unique
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      category: row.category ?? null,
      status: libraryStatus(row.status),
      percentage: row.percentage ?? null,
      favorite: row.isFavorite === 1,
      collections: held.get(row.id) ?? [],
      addedAt: row.addedAt,
      completedAt: row.completedAt ?? null,
    }));
}

export interface LibrarySearch {
  query?: string;
  status?: LibraryStatus;
  collection?: string;
  favorites?: boolean;
}

/** Books matching a name and the filters, best match first; browsing is newest first. */
export function searchLibrary(search: LibrarySearch, runtime: ToolRuntime): { books: LibraryBook[]; total: number } {
  const wantedCollection = search.collection?.trim().toLowerCase();
  const filtered = loadLibrary().filter(
    (book) =>
      (!search.status || book.status === search.status) &&
      (!search.favorites || book.favorite) &&
      (!wantedCollection || book.collections.some((name) => name.toLowerCase().includes(wantedCollection))),
  );
  const query = search.query?.trim();
  const matched = query ? rankBooks(query, filtered).map((entry) => entry.book) : filtered;
  return { books: matched.slice(0, SEARCH_LIMITS[runtime].library), total: matched.length };
}

export type BookResolution =
  | { ok: true; book: BookRow }
  | { ok: false; error: 'no_book_specified' | 'book_not_found' | 'ambiguous_book'; matches?: string[] };

/**
 * The book a title means, or the book the chat is about when none is given,
 * so "add this to my queue" said in a book chat just works.
 */
export function resolveLibraryBook(title: string | undefined, contextBookId: string | null): BookResolution {
  const trimmed = title?.trim();
  if (!trimmed) {
    if (!contextBookId) return { ok: false, error: 'no_book_specified' };
    const book = db.select().from(books).where(eq(books.id, contextBookId)).get();
    return book ? { ok: true, book } : { ok: false, error: 'book_not_found' };
  }
  const shelf = db.select().from(books).where(eq(books.kind, 'book')).all();
  const resolution = resolveTitle(trimmed, shelf);
  if (resolution.kind === 'one') return { ok: true, book: resolution.book };
  if (resolution.kind === 'ambiguous') {
    return { ok: false, error: 'ambiguous_book', matches: resolution.matches.map((book) => book.title) };
  }
  return { ok: false, error: 'book_not_found' };
}

/** Everything the app knows about one book, from the database and the book's own package file. */
export async function readBookDetails(row: BookRow): Promise<BookDetails> {
  const book = loadLibrary().find((entry) => entry.id === row.id) ?? {
    id: row.id,
    title: row.title,
    author: row.author,
    category: row.category ?? null,
    status: libraryStatus(row.status),
    percentage: null,
    favorite: row.isFavorite === 1,
    collections: [],
    addedAt: row.addedAt,
    completedAt: row.completedAt ?? null,
  };
  const highlightCount = db.select({ n: count() }).from(highlights).where(eq(highlights.bookId, row.id)).get()?.n ?? 0;
  const noteCount = db.select({ n: count() }).from(notes).where(eq(notes.bookId, row.id)).get()?.n ?? 0;

  let fileProblem: string | null = null;
  let packageInfo: Awaited<ReturnType<typeof readBookPackageInfo>> | null = null;
  if (!row.filePath) fileProblem = 'no file on this device';
  else {
    try {
      packageInfo = await readBookPackageInfo(row.filePath);
    } catch (error) {
      fileProblem = error instanceof Error ? error.message : 'unreadable';
    }
  }
  const metadata = packageInfo?.metadata;
  return {
    book,
    description: metadata?.description ?? null,
    publisher: metadata?.publisher ?? null,
    published: metadata?.published ?? null,
    language: metadata?.language ?? null,
    subjects: metadata?.subjects ?? [],
    isbn: metadata?.isbn ?? null,
    chapters: packageInfo?.sectionCount ?? null,
    highlights: highlightCount,
    notes: noteCount,
    fileProblem,
  };
}

/** Every collection with its books, or the one a name means. Null when that one does not exist. */
export function listCollectionsWithBooks(name?: string): CollectionListing[] | null {
  const all = db.select().from(collections).all();
  const wanted = name?.trim().toLowerCase();
  const chosen = wanted
    ? [all.find((c) => c.name.toLowerCase() === wanted) ?? all.find((c) => c.name.toLowerCase().includes(wanted))].filter(
        (c): c is (typeof all)[number] => c !== undefined,
      )
    : all;
  if (wanted && chosen.length === 0) return null;
  if (chosen.length === 0) return [];

  const library = new Map(loadLibrary().map((book) => [book.id, book]));
  const links = db
    .select({ bookId: bookCollections.bookId, collectionId: bookCollections.collectionId })
    .from(bookCollections)
    .where(inArray(bookCollections.collectionId, chosen.map((c) => c.id)))
    .all();
  return chosen.map((collection) => ({
    id: collection.id,
    name: collection.name,
    books: links
      .filter((link) => link.collectionId === collection.id)
      .map((link) => library.get(link.bookId))
      .filter((book): book is LibraryBook => book !== undefined),
  }));
}
