import type { TranscriptDoc } from 'samwell-shared';
import { describe, expect, it } from 'vitest';

import { episodeHighlightLocator, highlightSeconds } from '@/services/podcasts/transcript/highlight-locator';

const doc = {
  source: 'scribe',
  language: 'en',
  durationSec: 1900,
  speakers: {},
  segments: [
    { start: 0, end: 30, speaker: null, text: 'One.' },
    { start: 30, end: 60, speaker: null, text: 'Two.' },
    { start: 1000, end: 1030, speaker: null, text: 'Three.' },
  ],
} as unknown as TranscriptDoc;

describe('episodeHighlightLocator', () => {
  it('points at the paragraph in its part, and at its moment', () => {
    const { locator, chapter } = episodeHighlightLocator(doc, [], { segment: 2, seconds: 1004.25, text: 'Three.' });
    expect(locator.href).toBe('OEBPS/part2.xhtml');
    expect(locator.locations.fragments).toEqual(['s2', 't=1004.3']);
    expect(locator.locations.cssSelector).toBe('#s2');
    expect(locator.text.highlight).toBe('Three.');
    expect(chapter).toBe('15:00 to 30:00');
  });

  it("uses the episode's own chapters when it has them", () => {
    const { locator, chapter } = episodeHighlightLocator(doc, [{ startSec: 20, title: 'The middle' }, { startSec: 0, title: 'Opening' }], {
      segment: 1,
      seconds: 31,
      text: 'Two.',
    });
    expect(locator.href).toBe('OEBPS/part2.xhtml');
    expect(chapter).toBe('The middle');
  });
});

describe('highlightSeconds', () => {
  it("reads the moment back from a stored locator", () => {
    const { locator } = episodeHighlightLocator(doc, [], { segment: 0, seconds: 12, text: 'One.' });
    expect(highlightSeconds(JSON.stringify(locator))).toBe(12);
  });

  it("is null for a book's highlight or a bad row", () => {
    expect(highlightSeconds(JSON.stringify({ href: 'a.xhtml', locations: { progression: 0.2 } }))).toBeNull();
    expect(highlightSeconds('not json')).toBeNull();
    expect(highlightSeconds(null)).toBeNull();
  });
});
