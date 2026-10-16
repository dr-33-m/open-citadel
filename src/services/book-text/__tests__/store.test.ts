import { beforeEach, describe, expect, it } from 'vitest';

import type { ExtractedSection } from '@/services/book-text/extract';
import {
  forgetBook,
  indexedBookIds,
  indexedFingerprint,
  paragraphsOf,
  sectionsOf,
  writeBook,
  type SqlDriver,
} from '@/services/book-text/store';
import { prepareIndex } from '@/services/book-text/schema';
import { searchExact, searchParagraphs } from '@/services/book-text/search';
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
    expect(await indexedBookIds(driver)).toEqual(new Set(['b1']));
    await forgetBook(driver, 'b1');
    expect(await indexedFingerprint(driver, 'b1')).toBeNull();
    expect(await indexedBookIds(driver)).toEqual(new Set());
    expect(await searchParagraphs(driver, match('dawn'), [{ bookId: 'b1', extent: whole }], 10)).toEqual([]);
  });
});

describe('a search over a whole library', () => {
  const section = (index: number, paragraphs: string[], frontMatter = false): ExtractedSection => ({
    index,
    href: `s${index}.xhtml`,
    title: `Section ${index}`,
    frontMatter,
    paragraphs,
  });
  const whole = { lastSection: Number.MAX_SAFE_INTEGER, lastSectionChars: Infinity };

  it('answers from the ranked pool exactly as the exact query does', async () => {
    const scopes = [];
    for (let b = 0; b < 40; b++) {
      const words = Array.from({ length: 6 }, (_, i) => `A lantern ${'in the dark hall '.repeat((b + i) % 5)}lit book ${b} passage ${i}.`);
      await writeBook(driver, `lib${b}`, 'fp', [section(0, ['A lantern on the cover'], true), section(1, words), section(2, words)], 'now');
      // Every third book read only into its first section, partway.
      scopes.push({ bookId: `lib${b}`, extent: b % 3 === 0 ? { lastSection: 1, lastSectionChars: 120 } : whole });
    }
    const pooled = await searchParagraphs(driver, match('lantern'), scopes, 25);
    expect(pooled).toHaveLength(25);
    expect(pooled).toEqual(await searchExact(driver, match('lantern'), scopes, 25));
    expect(pooled.every((hit) => hit.section !== 0)).toBe(true);
  });

  it('falls back to the exact query when the best matches are all past the reader', async () => {
    const late = Array.from({ length: 2_100 }, (_, i) => `The lantern burned low over chapter five, line ${i}, here.`);
    await writeBook(driver, 'late', 'fp', [section(0, ['Opening.']), section(1, late)], 'now');
    await writeBook(driver, 'early', 'fp', [section(0, [`${'A long and winding passage of no consequence. '.repeat(30)}Then a lantern.`])], 'now');
    const scopes = [
      { bookId: 'late', extent: { lastSection: 0, lastSectionChars: Infinity } },
      { bookId: 'early', extent: whole },
      ...Array.from({ length: 30 }, (_, i) => ({ bookId: `absent${i}`, extent: whole })),
    ];
    const hits = await searchParagraphs(driver, match('lantern'), scopes, 5);
    expect(hits.map((hit) => hit.bookId)).toEqual(['early']);
  });
});
