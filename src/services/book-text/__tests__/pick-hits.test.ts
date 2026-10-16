import { describe, expect, it } from 'vitest';

import { pickHits } from '@/services/book-text/pick-hits';
import type { ParagraphHit } from '@/services/book-text/store';
import { parseSearchQuery } from '@/utils/search-terms';

const hit = (bookId: string, section: number, start: number, text: string, n = 1): ParagraphHit => ({
  bookId,
  section,
  start,
  text,
  n,
  sectionTitle: `Chapter ${section}`,
});

const WHOLE = { lastSection: 5, lastSectionChars: Infinity };
const OPTIONS = { limit: 10, perBook: 10, excerptChars: 400 };

describe('pickHits', () => {
  it('keeps a whole paragraph the index matched on a stem the simple check cannot see', () => {
    const found = [hit('a', 1, 0, 'He runs every morning.'), hit('a', 2, 0, 'A café on the corner.'), hit('a', 3, 0, 'The assembly-line came in 1913.')];
    for (const query of ['running', 'cafe', '"assembly line"']) {
      expect(pickHits(found, () => WHOLE, parseSearchQuery(query), OPTIONS)).toHaveLength(3);
    }
  });

  it('drops a paragraph cut at the reader when the words it matched were past the cut', () => {
    const extent = { lastSection: 1, lastSectionChars: 20 };
    const found = [hit('a', 1, 0, 'Early words here....... and the frugality comes later')];
    expect(pickHits(found, () => extent, parseSearchQuery('frugality'), OPTIONS)).toEqual([]);
    const before = [hit('a', 1, 0, 'Frugality is early, and more comes later on')];
    expect(pickHits(before, () => extent, parseSearchQuery('frugality'), OPTIONS)[0].text).toBe('Frugality is early, ');
  });

  it('never hands back a paragraph past the reader', () => {
    const extent = { lastSection: 1, lastSectionChars: 100 };
    expect(pickHits([hit('a', 2, 0, 'ahead'), hit('a', 1, 100, 'at the line')], () => extent, parseSearchQuery('ahead line'), OPTIONS)).toEqual([]);
  });

  it('holds each book to its share and the whole to the limit, best first', () => {
    const found = [hit('a', 1, 0, 'one', 1), hit('a', 1, 10, 'two', 2), hit('b', 1, 0, 'three', 1), hit('a', 1, 20, 'four', 3), hit('c', 1, 0, 'five', 1)];
    const picked = pickHits(found, () => WHOLE, parseSearchQuery('word'), { ...OPTIONS, perBook: 2, limit: 3 });
    expect(picked.map((p) => [p.bookId, p.paragraph])).toEqual([
      ['a', 1],
      ['a', 2],
      ['b', 1],
    ]);
  });

  it('leaves out a book it was not given', () => {
    expect(pickHits([hit('gone', 1, 0, 'text')], () => undefined, parseSearchQuery('text'), OPTIONS)).toEqual([]);
  });
});
