/**
 * Samwell's reading tools: search_reading, list_chapters and read_chapter,
 * over the book text index (`services/book-text`). Together they are how he
 * moves around what the reader has read the way a person moves around a code
 * base: search everything for a phrase, see a book's chapters, open one at a
 * paragraph and read on. Every answer is held to the reader's position.
 */
import { listReachedChapters, readReachedChapter, type ChapterRead, type ChapterSummary } from '@/services/book-text/chapters';
import { pickSection, reachedSections } from '@/services/book-text/extent';
import { bookExtent, readableBooks, searchPassages, type PassageSearch } from '@/services/book-text/reading';
import { CHARS_PER_TOKEN, estimateTokens } from '@/services/context-budget';
import { resolveLibraryBook } from '@/services/library-lookup';
import { READING_LIMITS, TOOL_RESULT_TOKEN_BUDGET, type ToolRuntime } from '@/services/tool-limits';
import type { BookRow as Book } from '@/services/book-text/book-row';
import { formatCount } from '@/utils/format';
import { isEmptyQuery, parseSearchQuery } from '@/utils/search-terms';

/** What the reading tools need of a tool call's context. */
export interface ReadingToolContext {
  bookId: string | null;
  runtime: ToolRuntime;
}

/** Books not yet in the index that a search reads on the spot; the rest fill in behind it. */
const INDEX_NOW: Record<ToolRuntime, number> = { device: 2, cloud: 4 };
/** Room the header and footer of a chapter read take, in characters. */
const READ_FRAME_CHARS = 400;

/** The book a title names (books and opened posts both), or the chat's own book with none. */
function resolveReadingBook(title: string | undefined, ctx: ReadingToolContext): { book: Book } | { error: string } {
  const resolution = resolveLibraryBook(title, ctx.bookId, { includePosts: true });
  if (resolution.ok) return { book: resolution.book };
  return { error: resolution.matches ? `${resolution.error} (did you mean: ${resolution.matches.join('; ')})` : resolution.error };
}

export interface ReadingSnippet {
  book: string;
  author: string;
  section: string | null;
  snippet: string;
  chapter: number;
  paragraph: number;
}

export interface ReadingSearchResult {
  snippets: ReadingSnippet[];
  chapters: string[];
  preparing: number;
  error?: string;
}

/** search_reading: the read text of everything, or of one book or chapter, best passages first. */
export async function searchReading(args: Record<string, unknown>, ctx: ReadingToolContext): Promise<ReadingSearchResult> {
  const empty: ReadingSearchResult = { snippets: [], chapters: [], preparing: 0 };
  const query = parseSearchQuery(typeof args.query === 'string' ? args.query : '');
  if (isEmptyQuery(query)) return { ...empty, error: 'Search for a word or phrase; the question words were all there was.' };

  const title = typeof args.book_title === 'string' && args.book_title.trim() ? args.book_title : undefined;
  const chapter = args.chapter == null ? '' : String(args.chapter).trim();
  let scope: Book[] = readableBooks();
  let section: number | undefined;
  // A chapter with no title is a chapter of the chat's own book.
  const narrowed = title !== undefined || chapter !== '';
  if (narrowed) {
    const found = resolveReadingBook(title, ctx);
    if ('error' in found) return { ...empty, error: found.error };
    scope = [found.book];
    if (chapter) {
      const known = await bookExtent(found.book);
      const picked = known ? pickSection(reachedSections(known.sections, known.extent), chapter) : null;
      if (!picked) return { ...empty, error: 'chapter_not_found_or_not_read_yet' };
      section = picked.index;
    }
  }

  const limits = READING_LIMITS[ctx.runtime];
  const found: PassageSearch = await searchPassages(query, {
    books: scope,
    section,
    limit: limits.maxSnippets,
    perBook: narrowed ? limits.maxSnippets : limits.maxPerBook,
    excerptChars: limits.window * 2,
    indexNow: INDEX_NOW[ctx.runtime],
  });
  return {
    snippets: found.hits.map((hit) => ({
      book: hit.book.title,
      author: hit.book.author,
      section: hit.sectionTitle,
      snippet: hit.text,
      chapter: hit.section,
      paragraph: hit.paragraph,
    })),
    chapters: found.chapters,
    preparing: found.preparing,
  };
}

/** Share of the budget the fallback chapter list may spend: a consolation for a failed search, not the answer. */
const CHAPTER_LIST_BUDGET_SHARE = 0.4;

export function formatReadingForLLM(result: ReadingSearchResult, tokenBudget: number): string {
  if (result.error) return `Could not search: ${result.error}.`;
  const preparing =
    result.preparing > 0
      ? ` ${result.preparing} more book${result.preparing === 1 ? ' is' : 's are'} still being prepared for search; search again in a minute to include ${result.preparing === 1 ? 'it' : 'them'}.`
      : '';
  if (result.snippets.length === 0) {
    // A failed search still hands back the map: the sections searched, so
    // the next try can use the book's own words.
    const base = 'No passage matched in what the reader has read (only text up to their position is searchable).';
    if (result.chapters.length === 0) return `${base}${preparing} Try their highlights instead.`;
    const listed: string[] = [];
    let spent = 0;
    for (const title of result.chapters) {
      const cost = estimateTokens(title);
      if (listed.length > 0 && spent + cost > tokenBudget * CHAPTER_LIST_BUDGET_SHARE) break;
      spent += cost;
      listed.push(title);
    }
    const more = result.chapters.length - listed.length;
    return `${base} Chapters read so far: ${listed.join('; ')}${more > 0 ? ` (and ${more} more)` : ''}.${preparing} Search again with wording drawn from these.`;
  }

  const head = 'Passages from what the reader has read, best first. To read one in context: read_chapter with its book, chapter number and a from_paragraph a little before it.';
  const blocks: string[] = [];
  let spent = estimateTokens(head);
  for (const [i, s] of result.snippets.entries()) {
    const where = `"${s.book}" by ${s.author}, chapter ${s.chapter}${s.section ? ` "${s.section}"` : ''}, paragraph ${s.paragraph}`;
    const block = `${i + 1}. ${where}:\n   "${s.snippet}"`;
    const cost = estimateTokens(block);
    if (blocks.length > 0 && spent + cost > tokenBudget) break;
    spent += cost;
    blocks.push(block);
  }
  const omitted = result.snippets.length - blocks.length;
  const tail = omitted > 0 ? `\n\n(${omitted} more passage${omitted === 1 ? '' : 's'} not shown.)` : '';
  return `${head}\n\n${blocks.join('\n\n')}${tail}${preparing ? `\n\n(${preparing.trim()})` : ''}`;
}

export interface ChapterListing {
  book: string;
  author: string;
  chapters: ChapterSummary[];
}

/** list_chapters: the chapters reached, with their sizes. */
export async function listChapters(args: Record<string, unknown>, ctx: ReadingToolContext): Promise<ChapterListing | { error: string }> {
  const found = resolveReadingBook(typeof args.book_title === 'string' ? args.book_title : undefined, ctx);
  if ('error' in found) return found;
  const chapters = await listReachedChapters(found.book);
  if ('error' in chapters) return chapters;
  return { book: found.book.title, author: found.book.author, chapters };
}

export function formatChapterListingForLLM(listing: ChapterListing | { error: string }): string {
  if ('error' in listing) return `Could not list chapters: ${listing.error}.`;
  if (listing.chapters.length === 0) return `The reader has not reached the body of "${listing.book}" yet, so there is nothing to browse.`;
  const lines = listing.chapters.map(
    (c) =>
      `${c.index}. ${c.title ?? '(untitled section)'} (~${formatCount(c.approxWords)} words, ${c.paragraphs} paragraphs` +
      `${c.current ? ', the reader is partway through it' : ''})`,
  );
  return `Chapters of "${listing.book}" by ${listing.author} the reader has reached. Read one with read_chapter (its number or title), adding from_paragraph to start partway.\n\n${lines.join('\n')}`;
}

export interface ChapterText extends ChapterRead {
  book: string;
}

/** read_chapter: a reached chapter from a paragraph on, as much as fits. */
export async function readChapter(args: Record<string, unknown>, ctx: ReadingToolContext): Promise<ChapterText | { error: string }> {
  const found = resolveReadingBook(typeof args.book_title === 'string' ? args.book_title : undefined, ctx);
  if ('error' in found) return found;
  const reference = typeof args.chapter === 'string' ? args.chapter : String(args.chapter ?? '');
  // Small models write numbers as strings as often as not.
  const asked = Number(args.from_paragraph);
  const from = Number.isFinite(asked) && asked >= 1 ? asked : 1;
  const maxChars = Math.max(800, TOOL_RESULT_TOKEN_BUDGET[ctx.runtime] * CHARS_PER_TOKEN - READ_FRAME_CHARS);
  const read = await readReachedChapter(found.book, reference, from, maxChars);
  return 'error' in read ? read : { ...read, book: found.book.title };
}

export function formatChapterTextForLLM(chapter: ChapterText | { error: string }): string {
  if ('error' in chapter) return `Could not read that chapter: ${chapter.error}.`;
  const name = `"${chapter.book}", chapter ${chapter.index}${chapter.title ? ` "${chapter.title}"` : ''}`;
  if (chapter.paragraphs.length === 0) {
    return chapter.atPosition
      ? `${name}: the reader has not read that far into this chapter yet.`
      : `${name} has no paragraph there (it has ${chapter.total}).`;
  }
  const first = chapter.paragraphs[0].n;
  const last = chapter.paragraphs[chapter.paragraphs.length - 1].n;
  const body = chapter.paragraphs.map((p) => `[${p.n}] ${p.text}`).join('\n\n');
  const after = chapter.atPosition
    ? '(The reader is partway through this chapter; it stops at their position.)'
    : chapter.next !== null
      ? `(Continues at paragraph ${chapter.next}: read_chapter with from_paragraph ${chapter.next}.)`
      : '(End of the chapter.)';
  return `From ${name}, paragraphs ${first} to ${last} of ${chapter.total}:\n\n${body}\n\n${after}`;
}
