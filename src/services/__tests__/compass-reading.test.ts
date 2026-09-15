import { describe, expect, it } from 'vitest';

import { extractKeywords, rankReadingCandidates, type ReadingCandidate } from '../compass-reading-rank';

function candidate(overrides: Partial<ReadingCandidate>): ReadingCandidate {
  return {
    kind: 'highlight',
    text: '',
    bookTitle: null,
    author: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('extractKeywords', () => {
  it('lowercases, dedupes, and drops stopwords and short words', () => {
    expect(
      extractKeywords('Today I want to fix the PDF import bug and ship the Reader'),
    ).toEqual(['fix', 'pdf', 'import', 'bug', 'ship', 'reader']);
  });

  it('returns empty for stopword-only input', () => {
    expect(extractKeywords('I want to do it today')).toEqual([]);
  });
});

describe('rankReadingCandidates', () => {
  const library: ReadingCandidate[] = [
    candidate({
      text: 'Knight shipped the shoe before it felt ready — waiting was the real risk.',
      bookTitle: 'Shoe Dog',
      author: 'Phil Knight',
      createdAt: '2026-05-01T00:00:00.000Z',
    }),
    candidate({
      kind: 'thought',
      text: 'Stop polishing. Ship the reader, then listen.',
      createdAt: '2026-06-01T00:00:00.000Z',
    }),
    candidate({
      text: 'A chapter about French cooking techniques.',
      bookTitle: 'Mastering the Art of French Cooking',
      createdAt: '2026-04-01T00:00:00.000Z',
    }),
  ];

  it('ranks by keyword overlap and drops non-matches', () => {
    const refs = rankReadingCandidates(library, extractKeywords('ship the reader before ready'));
    expect(refs.map((r) => r.kind)).toEqual(['thought', 'highlight']);
    expect(refs[1].bookTitle).toBe('Shoe Dog');
  });

  it('returns empty when there are no keywords or no matches', () => {
    expect(rankReadingCandidates(library, [])).toEqual([]);
    expect(rankReadingCandidates(library, ['blockchain'])).toEqual([]);
  });

  it('breaks score ties by recency', () => {
    const tied = [
      candidate({ text: 'ship it once', createdAt: '2026-01-01T00:00:00.000Z' }),
      candidate({ text: 'ship it twice', createdAt: '2026-03-01T00:00:00.000Z' }),
    ];
    const refs = rankReadingCandidates(tied, ['ship']);
    expect(refs[0].text).toBe('ship it twice');
  });

  it('gives book-title matches half weight', () => {
    const titled = [
      candidate({ text: 'unrelated line', bookTitle: 'The Founders', createdAt: '2026-01-01T00:00:00.000Z' }),
      candidate({ text: 'founders raise the bar', createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const refs = rankReadingCandidates(titled, ['founders']);
    expect(refs).toHaveLength(2);
    expect(refs[0].text).toBe('founders raise the bar');
  });

  it('ranks a tag match above a body-text mention of the same keyword', () => {
    const items = [
      candidate({ text: 'a passage that merely mentions resilience in passing', createdAt: '2026-02-01T00:00:00.000Z' }),
      candidate({ text: 'no literal overlap here at all', tags: ['resilience'], createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const refs = rankReadingCandidates(items, ['resilience']);
    expect(refs[0].text).toBe('no literal overlap here at all');
  });

  it('matches multi-word tags on any word', () => {
    const items = [
      candidate({ text: 'unrelated', tags: ['founder mindset'], createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(rankReadingCandidates(items, ['founder'])).toHaveLength(1);
    expect(rankReadingCandidates(items, ['mindset'])).toHaveLength(1);
  });

  it('truncates long passages at a word boundary with an ellipsis', () => {
    const long = candidate({ text: `ship ${'word '.repeat(120)}end` });
    const [ref] = rankReadingCandidates([long], ['ship']);
    expect(ref.text.length).toBeLessThanOrEqual(401);
    expect(ref.text.endsWith('…')).toBe(true);
  });

  it('caps the number of returned refs', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      candidate({ text: `ship attempt ${i}`, createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    expect(rankReadingCandidates(many, ['ship'])).toHaveLength(8);
  });
});
