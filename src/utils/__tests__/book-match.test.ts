import { describe, expect, it } from 'vitest';

import { ALL_WORDS, EXACT, LEADING, normalizeForMatch, rankBooks, resolveTitle, scoreBook } from '../book-match';

const library = [
  { id: 'taste', title: 'The Taste of Luxury: Bernard Arnault and the Moët-Hennessy Louis Vuitton Story', author: 'Nadege Forestier' },
  { id: 'strategy', title: 'The Luxury Strategy: Break the Rules of Marketing to Build Luxury Brands', author: 'Kapferer, Jean-Noel.; Bastien, Vincent' },
  { id: 'anna', title: 'Anna: The Biography', author: 'Amy Odell' },
  { id: 'ametora', title: 'Ametora: How Japan Saved American Style', author: 'W. David Marx' },
  { id: 'jewelry', title: 'Jewelry concepts and technology', author: 'Unknown' },
  { id: 'dressed', title: 'Dressed', author: 'Shahidha Bari' },
];

describe('normalizeForMatch', () => {
  it('drops accents, case and punctuation', () => {
    expect(normalizeForMatch('Moët-Hennessy: LOUIS')).toBe('moet hennessy louis');
  });
});

describe('scoreBook', () => {
  it('scores an exact title highest, ignoring a leading article', () => {
    expect(scoreBook('dressed', library[5])).toBe(EXACT);
    expect(scoreBook('Taste of Luxury: Bernard Arnault and the Moet-Hennessy Louis Vuitton Story', library[0])).toBe(EXACT);
  });

  it('treats the part before a colon, or the start of the title, as leading', () => {
    expect(scoreBook('Taste of Luxury', library[0])).toBe(LEADING);
    expect(scoreBook('anna', library[2])).toBe(LEADING);
  });

  it('matches every word across title and author', () => {
    expect(scoreBook('Arnault luxury', library[0])).toBeGreaterThanOrEqual(ALL_WORDS);
    expect(scoreBook('Odell', library[2])).toBe(ALL_WORDS);
  });

  it('does not let a stop word match half the library', () => {
    expect(scoreBook('of', library[3])).toBe(0);
    expect(scoreBook('Taste of Luxury', library[3])).toBe(0);
  });

  it('never matches inside a word', () => {
    expect(scoreBook('art', library[1])).toBe(0);
  });
});

describe('resolveTitle', () => {
  it('finds the book the reader could not get Samwell to see', () => {
    expect(resolveTitle('Taste of Luxury', library)).toEqual({ kind: 'one', book: library[0] });
  });

  it('prefers the title a name leads over one it only appears in', () => {
    expect(resolveTitle('luxury', library)).toEqual({ kind: 'one', book: library[1] });
  });

  it('is ambiguous when two books match equally well', () => {
    const shelf = [
      { id: 'a', title: 'Notes on Style', author: 'X' },
      { id: 'b', title: 'Modern Style Notes', author: 'Y' },
    ];
    const result = resolveTitle('style notes', shelf);
    expect(result.kind === 'ambiguous' && result.matches.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('offers partial matches as suggestions rather than an answer', () => {
    const result = resolveTitle('Luxury Wine', library);
    expect(result.kind).toBe('ambiguous');
  });

  it('says none when nothing matches', () => {
    expect(resolveTitle('Moby Dick', library)).toEqual({ kind: 'none' });
  });
});

describe('rankBooks', () => {
  it('puts the better match first', () => {
    expect(rankBooks('luxury strategy', library)[0]?.book.id).toBe('strategy');
  });
});
