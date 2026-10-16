import { describe, expect, it } from 'vitest';

import { excerptAround, filterTerms, ftsMatch, isEmptyQuery, matchScore, parseSearchQuery, rankByMatch, stem } from '@/utils/search-terms';

describe('parseSearchQuery', () => {
  it('keeps quoted phrases whole and drops the filler of a question', () => {
    expect(parseSearchQuery('What does he say about "compound interest" and patience?')).toEqual({
      phrases: ['compound interest'],
      words: ['patience'],
    });
  });

  it('reads any script and keeps apostrophes inside words', () => {
    expect(parseSearchQuery('Ford’s factory Ελλάδα 1914')).toEqual({ phrases: [], words: ['ford’s', 'factory', 'ελλάδα', '1914'] });
  });

  it('is empty when only filler was asked', () => {
    expect(isEmptyQuery(parseSearchQuery('what is the book about'))).toBe(true);
  });
});

describe('ftsMatch', () => {
  it('quotes every term so nothing reads as syntax', () => {
    expect(ftsMatch({ phrases: ['say "no"'], words: ['near', 'and*'] })).toBe('"say ""no""" OR "near" OR "and*"');
    expect(ftsMatch({ phrases: [], words: [] })).toBeNull();
  });
});

describe('matchScore', () => {
  it('ranks text holding more of the query higher, phrases double', () => {
    const query = parseSearchQuery('"self reliance" leadership habits');
    expect(matchScore('Leaders build habits through self reliance.', query)).toBe(4);
    expect(matchScore('On habits.', query)).toBe(1);
    expect(matchScore('Nothing here.', query)).toBe(0);
  });
});

describe('excerptAround', () => {
  it('cuts long text around the first match, at word boundaries', () => {
    const text = `${'filler words here '.repeat(40)}the discipline of habit ${'more filler words '.repeat(40)}`;
    const excerpt = excerptAround(text, parseSearchQuery('discipline'), 200);
    expect(excerpt).toContain('discipline');
    expect(excerpt.startsWith('…') && excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(202);
  });

  it('leaves short text alone', () => {
    expect(excerptAround('short', parseSearchQuery('short'), 100)).toBe('short');
  });
});

describe('stem', () => {
  it('takes common endings off, never below four letters', () => {
    expect(stem('leadership')).toBe('lead');
    expect(stem('leaders')).toBe('lead');
    expect(stem('leading')).toBe('lead');
    expect(stem('habits')).toBe('habit');
    expect(stem('bus')).toBe('bus');
  });
});

describe('rankByMatch', () => {
  it('puts what holds more of the query first, keeps order between equals, and drops non-matches', () => {
    const rows = ['habits matter', 'nothing here', 'discipline builds habits', 'discipline alone'];
    expect(rankByMatch(rows, parseSearchQuery('discipline habits'), (row) => row)).toEqual([
      'discipline builds habits',
      'habits matter',
      'discipline alone',
    ]);
  });
});

describe('filterTerms', () => {
  it('gives phrases whole and words by their stem', () => {
    expect(filterTerms(parseSearchQuery('"deep work" leaders'))).toEqual(['deep work', 'lead']);
  });
});
