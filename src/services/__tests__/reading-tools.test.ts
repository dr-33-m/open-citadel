import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchPassages = vi.fn();
const bookExtent = vi.fn();
const resolveLibraryBook = vi.fn();

vi.mock('@/services/book-text/reading', () => ({
  readableBooks: () => [BOOK, POST],
  searchPassages: (...args: unknown[]) => searchPassages(...args),
  bookExtent: (...args: unknown[]) => bookExtent(...args),
}));
const readReachedChapter = vi.fn();
vi.mock('@/services/book-text/chapters', () => ({
  listReachedChapters: vi.fn(),
  readReachedChapter: (...args: unknown[]) => readReachedChapter(...args),
}));
vi.mock('@/services/library-lookup', () => ({ resolveLibraryBook: (...args: unknown[]) => resolveLibraryBook(...args) }));

const BOOK = { id: 'b1', title: 'Meditations', author: 'Marcus Aurelius', kind: 'book' };
const POST = { id: 'p1', title: 'On Habits', author: 'A Blogger', kind: 'article' };

const { formatChapterListingForLLM, formatChapterTextForLLM, formatReadingForLLM, readChapter, searchReading } = await import(
  '@/services/reading-tools'
);

const ctx = { bookId: null, runtime: 'cloud' as const };

beforeEach(() => {
  searchPassages.mockReset().mockResolvedValue({ hits: [], searched: 2, preparing: 0, chapters: [] });
  bookExtent.mockReset();
  resolveLibraryBook.mockReset();
  readReachedChapter.mockReset().mockResolvedValue({ error: 'nothing_read_yet' });
});

describe('searchReading', () => {
  it('turns down a query that was only filler, without searching', async () => {
    const result = await searchReading({ query: 'what does the book say' }, ctx);
    expect(result.error).toMatch(/word or phrase/);
    expect(searchPassages).not.toHaveBeenCalled();
  });

  it('searches every book and post read when no book is named', async () => {
    await searchReading({ query: 'discipline' }, ctx);
    expect(searchPassages.mock.calls[0][1].books).toEqual([BOOK, POST]);
  });

  it('searches one book, and one chapter of it, when asked', async () => {
    resolveLibraryBook.mockReturnValue({ ok: true, book: BOOK });
    bookExtent.mockResolvedValue({
      sections: [{ index: 4, href: 'c4', chars: 10, title: 'Book Four', frontMatter: false, paragraphs: 3 }],
      extent: { lastSection: 4, lastSectionChars: Infinity },
    });
    await searchReading({ query: 'anger', book_title: 'Meditations', chapter: 'book four' }, ctx);
    expect(resolveLibraryBook).toHaveBeenCalledWith('Meditations', null, { includePosts: true });
    expect(searchPassages.mock.calls[0][1]).toMatchObject({ books: [BOOK], section: 4 });
  });

  it('takes a chapter with no title as a chapter of the chat\'s own book', async () => {
    resolveLibraryBook.mockReturnValue({ ok: true, book: BOOK });
    bookExtent.mockResolvedValue({
      sections: [{ index: 4, href: 'c4', chars: 10, title: 'Book Four', frontMatter: false, paragraphs: 3 }],
      extent: { lastSection: 4, lastSectionChars: Infinity },
    });
    await searchReading({ query: 'anger', chapter: 4 }, { ...ctx, bookId: 'b1' });
    expect(resolveLibraryBook).toHaveBeenCalledWith(undefined, 'b1', { includePosts: true });
    expect(searchPassages.mock.calls[0][1]).toMatchObject({ books: [BOOK], section: 4 });
  });

  it('says so when a named chapter is not one the reader has reached', async () => {
    resolveLibraryBook.mockReturnValue({ ok: true, book: BOOK });
    bookExtent.mockResolvedValue({ sections: [], extent: { lastSection: -1, lastSectionChars: 0 } });
    expect((await searchReading({ query: 'anger', book_title: 'Meditations', chapter: '9' }, ctx)).error).toBe(
      'chapter_not_found_or_not_read_yet',
    );
  });

  it('names near matches when a title is ambiguous', async () => {
    resolveLibraryBook.mockReturnValue({ ok: false, error: 'ambiguous_book', matches: ['Meditations', 'Meditations II'] });
    expect((await searchReading({ query: 'anger', book_title: 'Medit' }, ctx)).error).toBe(
      'ambiguous_book (did you mean: Meditations; Meditations II)',
    );
  });
});

describe('formatReadingForLLM', () => {
  it('cites each passage by book, chapter and paragraph, and says how to read on', () => {
    const text = formatReadingForLLM(
      {
        snippets: [{ book: 'Meditations', author: 'Marcus Aurelius', section: 'Book Four', snippet: 'You have power over your mind.', chapter: 4, paragraph: 12 }],
        chapters: [],
        preparing: 2,
      },
      8000,
    );
    expect(text).toContain('"Meditations" by Marcus Aurelius, chapter 4 "Book Four", paragraph 12');
    expect(text).toContain('read_chapter');
    expect(text).toContain('2 more books are still being prepared');
  });

  it('hands back the chapters searched when nothing matched', () => {
    const text = formatReadingForLLM({ snippets: [], chapters: ['Book One', 'Book Two'], preparing: 0 }, 8000);
    expect(text).toContain('Chapters read so far: Book One; Book Two.');
  });
});

describe('formatChapterTextForLLM', () => {
  const base = { book: 'Meditations', index: 4, title: 'Book Four', total: 40 };

  it('numbers the paragraphs and says where to pick up', () => {
    const text = formatChapterTextForLLM({ ...base, paragraphs: [{ n: 10, text: 'One.' }, { n: 11, text: 'Two.' }], next: 12, atPosition: false });
    expect(text).toContain('paragraphs 10 to 11 of 40');
    expect(text).toContain('[10] One.\n\n[11] Two.');
    expect(text).toContain('from_paragraph 12');
  });

  it('says when it stopped at the reader, and when they have not read that far', () => {
    expect(formatChapterTextForLLM({ ...base, paragraphs: [{ n: 1, text: 'One.' }], next: null, atPosition: true })).toContain('stops at their position');
    expect(formatChapterTextForLLM({ ...base, paragraphs: [], next: null, atPosition: true })).toContain('not read that far');
  });
});

describe('formatChapterListingForLLM', () => {
  it('lists number, title, words and paragraphs, and marks the one in progress', () => {
    const text = formatChapterListingForLLM({
      book: 'Meditations',
      author: 'Marcus Aurelius',
      chapters: [
        { index: 3, title: 'Book Three', paragraphs: 30, approxWords: 2400, current: false },
        { index: 4, title: 'Book Four', paragraphs: 40, approxWords: 800, current: true },
      ],
    });
    expect(text).toContain('3. Book Three (~2,400 words, 30 paragraphs)');
    expect(text).toContain('4. Book Four (~800 words, 40 paragraphs, the reader is partway through it)');
  });
});

describe('readChapter', () => {
  it('reads from a paragraph given as a number or as a string, and from the start otherwise', async () => {
    resolveLibraryBook.mockReturnValue({ ok: true, book: BOOK });
    for (const [given, from] of [[12, 12], ['12', 12], [undefined, 1], ['soon', 1], [0, 1]] as const) {
      await readChapter({ chapter: '3', from_paragraph: given }, ctx);
      expect(readReachedChapter.mock.lastCall?.[2]).toBe(from);
    }
  });
});
