/**
 * The library, written for Samwell to read.
 *
 * What `search_library`, `get_book_details` and `list_collections` hand the
 * model, as text. Every book line carries its `[[book:id]]` reference on a
 * labelled line of its own, the way highlights carry theirs: the model copies
 * markers it is shown that way, and the chat draws each one as the book.
 *
 * Pure, so the wording is tested without a database.
 */
import { estimateTokens } from '@/services/context-budget';

export type LibraryStatus = 'reading' | 'queued' | 'finished' | 'unstarted';

export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  category: string | null;
  status: LibraryStatus;
  percentage: number | null;
  favorite: boolean;
  collections: string[];
  addedAt: string;
  completedAt: string | null;
}

/** The `books.status` column in the tools' words. `archived` is what finishing a book sets. */
export function libraryStatus(status: string | null | undefined): LibraryStatus {
  if (status === 'reading') return 'reading';
  if (status === 'queued') return 'queued';
  if (status === 'archived') return 'finished';
  return 'unstarted';
}

const STATUS_WORDS: Record<LibraryStatus, string> = {
  reading: 'reading',
  queued: 'in the queue',
  finished: 'finished',
  unstarted: 'not started',
};

/** "2026-03-02T…" as "2026-03-02": the day is what matters to a reader. */
function day(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/** Where a reader stands with a book, in a few words. */
export function standing(book: Pick<LibraryBook, 'status' | 'percentage' | 'completedAt'>): string {
  if (book.status === 'reading' && book.percentage != null) return `reading, ${Math.round(book.percentage * 100)}% through`;
  if (book.status === 'finished' && book.completedAt) return `finished ${day(book.completedAt)}`;
  return STATUS_WORDS[book.status];
}

export function formatLibraryBook(book: LibraryBook): string {
  const facts = [
    standing(book),
    book.category,
    book.collections.length > 0 ? `in ${book.collections.map((name) => `"${name}"`).join(', ')}` : null,
    book.favorite ? 'a favourite' : null,
  ].filter(Boolean);
  return `- "${book.title}" by ${book.author} (${facts.join('; ')})\n  Ref: [[book:${book.id}]]`;
}

/**
 * Book lines up to the budget, saying how many were left out rather than
 * dropping them silently. A line is never cut, so a title never goes without
 * the marker that draws it.
 */
export function formatBookLines(books: LibraryBook[], tokenBudget: number, more = 0): string {
  const lines: string[] = [];
  let spent = 0;
  for (const book of books) {
    const line = formatLibraryBook(book);
    const cost = estimateTokens(line);
    if (lines.length > 0 && spent + cost > tokenBudget) break;
    spent += cost;
    lines.push(line);
  }
  const omitted = books.length - lines.length + more;
  return omitted > 0 ? `${lines.join('\n')}\n(${omitted} more not shown. Narrow the search to see them.)` : lines.join('\n');
}

export function formatLibrarySearch(
  result: { books: LibraryBook[]; total: number },
  query: string | undefined,
  tokenBudget: number,
): string {
  if (result.total === 0) {
    return query
      ? `No book in the library matches "${query}". Say so plainly; do not guess. Ask the user for another part of the title or the author.`
      : 'No books match those filters.';
  }
  const heading = `${result.total} book${result.total === 1 ? '' : 's'} found.`;
  return `${heading}\n${formatBookLines(result.books, tokenBudget, result.total - result.books.length)}`;
}

export interface BookDetails {
  book: LibraryBook;
  description: string | null;
  publisher: string | null;
  published: string | null;
  language: string | null;
  subjects: string[];
  isbn: string | null;
  /** Sections after the front matter, or null when the file could not be read. */
  chapters: number | null;
  highlights: number;
  notes: number;
  /** Why the file's own details are missing, when they are. */
  fileProblem: string | null;
}

export function formatBookDetails(details: BookDetails): string {
  const { book } = details;
  const lines = [
    `"${book.title}" by ${book.author}`,
    `Ref: [[book:${book.id}]]`,
    `Where the user is: ${standing(book)}.`,
    `Added to the library: ${day(book.addedAt)}.`,
    book.collections.length > 0 ? `Collections: ${book.collections.join(', ')}.` : 'Collections: none.',
    book.favorite ? 'One of their favourites.' : null,
    `They have made ${details.highlights} highlight${details.highlights === 1 ? '' : 's'} and ${details.notes} note${details.notes === 1 ? '' : 's'} in it.`,
    details.publisher ? `Publisher: ${details.publisher}.` : null,
    details.published ? `Published: ${details.published}.` : null,
    details.language ? `Language: ${details.language}.` : null,
    details.isbn ? `ISBN: ${details.isbn}.` : null,
    book.category ? `Category: ${book.category}.` : null,
    details.subjects.length > 0 ? `Subjects: ${details.subjects.join(', ')}.` : null,
    details.chapters != null ? `About ${details.chapters} chapters or sections.` : null,
    details.description
      ? `Publisher's description (the jacket copy, safe to share before they read it):\n${details.description}`
      : "The book file carries no description. If they want to know what it is about, search the web for it by title and author, keeping to what a jacket would say.",
    details.fileProblem ? `(The book file could not be read: ${details.fileProblem}.)` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

export interface CollectionListing {
  id: string;
  name: string;
  books: LibraryBook[];
}

/** Each collection with its books under it, as far as the budget goes. */
export function formatCollections(listing: CollectionListing[], tokenBudget: number): string {
  if (listing.length === 0) return 'No collections yet.';
  const blocks: string[] = [];
  let spent = 0;
  for (const [i, collection] of listing.entries()) {
    const heading = `"${collection.name}" (${collection.books.length} book${collection.books.length === 1 ? '' : 's'})`;
    const share = Math.max(80, Math.floor((tokenBudget - spent) / (listing.length - i)));
    const body = collection.books.length > 0 ? formatBookLines(collection.books, share - estimateTokens(heading)) : '  (empty)';
    const block = `${heading}\n${body}`;
    const cost = estimateTokens(block);
    if (blocks.length > 0 && spent + cost > tokenBudget) {
      blocks.push(`(${listing.length - i} more collection${listing.length - i === 1 ? '' : 's'} not shown. Ask for one by name.)`);
      break;
    }
    spent += cost;
    blocks.push(block);
  }
  return blocks.join('\n\n');
}
