import { describe, expect, it } from 'vitest';

import { NOTHING_READ, pickSection, reachedSections, readableExtent, readablePart } from '@/services/book-text/extent';

const SECTIONS = [
  { index: 0, href: 'OEBPS/cover.xhtml', chars: 50 },
  { index: 1, href: 'OEBPS/ch1.xhtml', chars: 1000 },
  { index: 2, href: 'OEBPS/ch2.xhtml', chars: 2000 },
];

describe('readableExtent', () => {
  it('fails closed with no position, and opens a finished book whole', () => {
    expect(readableExtent(SECTIONS, undefined)).toEqual(NOTHING_READ);
    expect(readableExtent(SECTIONS, null)).toEqual({ lastSection: 2, lastSectionChars: Infinity });
  });

  it('stops partway through the section the reader is in', () => {
    expect(readableExtent(SECTIONS, { href: 'ch1.xhtml', locations: { progression: 0.25 } })).toEqual({
      lastSection: 1,
      lastSectionChars: 250,
    });
  });

  it('fails closed on a position it cannot place', () => {
    expect(readableExtent(SECTIONS, { href: 'nowhere.xhtml' })).toEqual(NOTHING_READ);
  });
});

describe('readablePart', () => {
  const extent = { lastSection: 1, lastSectionChars: 250 };

  it('gives earlier sections whole, the current one up to the position, later ones nothing', () => {
    expect(readablePart(extent, 0, 0, 'cover')).toBe('cover');
    expect(readablePart(extent, 1, 200, 'x'.repeat(100))).toBe('x'.repeat(50));
    expect(readablePart(extent, 1, 0, 'short')).toBe('short');
    expect(readablePart(extent, 1, 250, 'past it')).toBeNull();
    expect(readablePart(extent, 2, 0, 'ahead')).toBeNull();
  });
});

describe('reachedSections and pickSection', () => {
  const sections = [
    { index: 0, href: 'c.xhtml', chars: 10, title: 'Cover', frontMatter: true },
    { index: 1, href: '1.xhtml', chars: 10, title: 'The Beginning', frontMatter: false },
    { index: 2, href: '2.xhtml', chars: 10, title: 'Ends and Means', frontMatter: false },
    { index: 3, href: '3.xhtml', chars: 10, title: 'Spoilers', frontMatter: false },
  ];
  const reached = reachedSections(sections, { lastSection: 2, lastSectionChars: 5 });

  it('leaves out front matter and everything past the reader', () => {
    expect(reached.map((s) => s.index)).toEqual([1, 2]);
  });

  it('picks by number, then exact title, then part of a title, case aside', () => {
    expect(pickSection(reached, '2')?.title).toBe('Ends and Means');
    expect(pickSection(reached, 'the beginning')?.index).toBe(1);
    expect(pickSection(reached, 'MEANS')?.index).toBe(2);
    expect(pickSection(reached, '3')).toBeNull();
    expect(pickSection(reached, 'spoilers')).toBeNull();
    expect(pickSection(reached, '')).toBeNull();
  });
});
