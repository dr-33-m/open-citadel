import { describe, expect, it } from 'vitest';

import { findQuote, readerHref } from '../quote-anchor';

const SECTION = [
  'The first paragraph sets the scene.',
  'He said, “You cannot step into the same river twice” — and then he left without another word.',
  'A third paragraph, much later, about nothing in particular at all.',
].join('\n\n');

const slice = (span: { start: number; end: number } | null) => (span ? SECTION.slice(span.start, span.end) : null);

describe('findQuote', () => {
  it('finds a verbatim quote and returns the book’s own characters', () => {
    expect(slice(findQuote(SECTION, 'You cannot step into the same river twice'))).toBe(
      'You cannot step into the same river twice',
    );
  });

  it('folds straight quotes and hyphens onto the book’s curly ones and dashes', () => {
    const span = findQuote(SECTION, '"You cannot step into the same river twice" - and then he left');
    expect(slice(span)).toBe('You cannot step into the same river twice” — and then he left');
  });

  it('ignores case and whitespace, including across a paragraph break', () => {
    expect(slice(findQuote(SECTION, 'sets   the SCENE. He said'))).toBe('sets the scene.\n\nHe said');
  });

  it('spans an ellipsis between two pieces in order', () => {
    expect(slice(findQuote(SECTION, 'He said… without another word'))).toBe(
      'He said, “You cannot step into the same river twice” — and then he left without another word',
    );
  });

  it('ignores the paragraph numbers read_chapter puts in front of each paragraph', () => {
    expect(slice(findQuote(SECTION, '[1] The first paragraph sets the scene. [2] He said'))).toBe(
      'The first paragraph sets the scene.\n\nHe said',
    );
  });

  it('does not loosely match unless asked', () => {
    expect(findQuote(SECTION, 'You can never step into the same river twice')).toBeNull();
  });

  it('loosely matches a quote with a word changed, trimmed to the words it shares', () => {
    const span = findQuote(SECTION, 'You can never step into the same river twice', true);
    expect(slice(span)).toBe('You cannot step into the same river twice');
    expect(span!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('finds nothing for a passage that is not there', () => {
    expect(findQuote(SECTION, 'An entirely different sentence that appears nowhere in it', true)).toBeNull();
  });

  it('will not loosely match a quote too short to be sure of', () => {
    expect(findQuote(SECTION, 'the same lake', true)).toBeNull();
  });
});

describe('readerHref', () => {
  it('is the spine path when the reader names resources the same way', () => {
    expect(readerHref('OEBPS/ch6.xhtml', { href: 'OEBPS/ch5.xhtml', spinePath: 'OEBPS/ch5.xhtml' })).toBe('OEBPS/ch6.xhtml');
  });

  it('keeps a leading slash the reader uses', () => {
    expect(readerHref('OEBPS/ch6.xhtml', { href: '/OEBPS/ch5.xhtml', spinePath: 'OEBPS/ch5.xhtml' })).toBe('/OEBPS/ch6.xhtml');
  });

  it('drops a folder the reader leaves out', () => {
    expect(readerHref('OEBPS/Text/ch6.xhtml', { href: 'Text/ch5.xhtml', spinePath: 'OEBPS/Text/ch5.xhtml' })).toBe(
      'Text/ch6.xhtml',
    );
  });

  it('percent-encodes, as the reader does', () => {
    expect(readerHref('OEBPS/chapter 6.xhtml', { href: 'OEBPS/chapter%205.xhtml', spinePath: 'OEBPS/chapter 5.xhtml' })).toBe(
      'OEBPS/chapter%206.xhtml',
    );
  });

  it('falls back to the encoded spine path with nothing to go by', () => {
    expect(readerHref('OEBPS/chapter 6.xhtml', null)).toBe('OEBPS/chapter%206.xhtml');
  });
});
