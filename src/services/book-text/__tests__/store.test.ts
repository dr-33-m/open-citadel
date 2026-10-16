import { beforeEach, describe, expect, it } from 'vitest';

import type { ExtractedSection } from '@/services/book-text/extract';
import {
  forgetBook,
  indexedFingerprint,
  paragraphsOf,
  searchParagraphs,
  sectionsOf,
  writeBook,
  type SqlDriver,
} from '@/services/book-text/store';
import { prepareIndex } from '@/services/book-text/schema';
import { ftsMatch, parseSearchQuery } from '@/utils/search-terms';
import { nodeDriver } from './node-driver';

const BOOK: ExtractedSection[] = [
  { index: 0, href: 'OEBPS/cover.xhtml', title: 'Cover', frontMatter: true, paragraphs: ['Discipline: a novel'] },
  {
    index: 1,
    href: 'OEBPS/ch1.xhtml',
    title: 'Beginnings',
    frontMatter: false,
    paragraphs: ['He woke before dawn every day, a habit his father had drilled into him.', 'Discipline was not a word he liked, but it was what he lived by.'],
  },
  {
    index: 2,
    href: 'OEBPS/ch2.xhtml',
    title: 'The Turn',
    frontMatter: false,
    paragraphs: ['Leaders, he learned, are made by the discipline of small habits.', 'The secret ending: the father was the spy all along.'],
  },
];

const match = (query: string) => ftsMatch(parseSearchQuery(query)) as string;
let driver: SqlDriver;

beforeEach(async () => {
  driver = nodeDriver();
  await prepareIndex(driver);
  await writeBook(driver, 'b1', 'fp1', BOOK, '2026-10-16T00:00:00Z');
});

describe('the book text index', () => {
  it('keeps sections with their sizes, and paragraphs numbered from 1', async () => {
    expect(await indexedFingerprint(driver, 'b1')).toBe('fp1');
    const sections = await sectionsOf(driver, 'b1');
    expect(sections.map((s) => [s.index, s.title, s.frontMatter, s.paragraphs])).toEqual([
      [0, 'Cover', true, 1],
      [1, 'Beginnings', false, 2],
      [2, 'The Turn', false, 2],
    ]);
    expect(sections[1].chars).toBe(BOOK[1].paragraphs.join('\n\n').length);
    const paragraphs = await paragraphsOf(driver, 'b1', 1, 2, 10);
    expect(paragraphs).toEqual([{ section: 1, n: 2, start: BOOK[1].paragraphs[0].length + 2, text: BOOK[1].paragraphs[1] }]);
  });

  it('finds stemmed words, best passage first, and never in front matter', async () => {
    const whole = { lastSection: 2, lastSectionChars: Infinity };
    const hits = await searchParagraphs(driver, match('leading discipline habits'), [{ bookId: 'b1', extent: whole }], 10);
    expect(hits[0]).toMatchObject({ bookId: 'b1', section: 2, n: 1, sectionTitle: 'The Turn' });
    expect(hits.some((hit) => hit.section === 0)).toBe(false);
  });

  it('never finds what is past the reader', async () => {
    const partway = { lastSection: 1, lastSectionChars: 30 };
    expect(await searchParagraphs(driver, match('spy'), [{ bookId: 'b1', extent: partway }], 10)).toEqual([]);
    // The paragraph the reader is in comes back for the caller to cut; the next one does not.
    const hits = await searchParagraphs(driver, match('habit discipline'), [{ bookId: 'b1', extent: partway }], 10);
    expect(hits.map((hit) => [hit.section, hit.n])).toEqual([[1, 1]]);
    expect(await searchParagraphs(driver, match('dawn'), [{ bookId: 'b1', extent: { lastSection: -1, lastSectionChars: 0 } }], 10)).toEqual([]);
  });

  it('never finds a book whose index is not finished', async () => {
    await driver.run("DELETE FROM indexed_books WHERE book_id = 'b1'");
    const whole = { lastSection: 2, lastSectionChars: Infinity };
    expect(await searchParagraphs(driver, match('dawn'), [{ bookId: 'b1', extent: whole }], 10)).toEqual([]);
  });

  it('searches one chapter when asked to', async () => {
    const whole = { lastSection: 2, lastSectionChars: Infinity };
    const hits = await searchParagraphs(driver, match('discipline'), [{ bookId: 'b1', extent: whole, section: 1 }], 10);
    expect(hits.map((hit) => hit.section)).toEqual([1]);
  });

  it('replaces a book whole when it is indexed again, and forgets it on request', async () => {
    await writeBook(driver, 'b1', 'fp2', [BOOK[1]], '2026-10-16T01:00:00Z');
    expect(await indexedFingerprint(driver, 'b1')).toBe('fp2');
    const whole = { lastSection: 2, lastSectionChars: Infinity };
    expect(await searchParagraphs(driver, match('spy'), [{ bookId: 'b1', extent: whole }], 10)).toEqual([]);
    await forgetBook(driver, 'b1');
    expect(await indexedFingerprint(driver, 'b1')).toBeNull();
    expect(await searchParagraphs(driver, match('dawn'), [{ bookId: 'b1', extent: whole }], 10)).toEqual([]);
  });
});
