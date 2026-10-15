import { describe, expect, it } from 'vitest';

import { WEB_SEARCH_MAX_SOURCES, hostOf, readCostUsd, readWebSources, trimSnippet } from '../web-search-results.js';

describe('readWebSources', () => {
  it('reads the chat completions shape', () => {
    expect(
      readWebSources([
        {
          type: 'url_citation',
          url_citation: { url: 'https://en.wikipedia.org/wiki/Luxury', title: 'Luxury', content: 'Luxury  goods\nare...' },
        },
      ]),
    ).toEqual([{ title: 'Luxury', url: 'https://en.wikipedia.org/wiki/Luxury', snippet: 'Luxury goods are...' }]);
  });

  it('reads the flat Responses shape and falls back to the host for a title', () => {
    expect(readWebSources([{ type: 'url_citation', url: 'https://www.example.com/a', content: '' }])).toEqual([
      { title: 'example.com', url: 'https://www.example.com/a', snippet: '' },
    ]);
  });

  it('keeps each address once, drops non-web ones and caps the list', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ url: `https://site${i}.com`, title: `S${i}` }));
    const sources = readWebSources([
      { url: 'javascript:alert(1)', title: 'bad' },
      { url: 'https://site0.com', title: 'dupe first' },
      ...many,
    ]);
    expect(sources).toHaveLength(WEB_SEARCH_MAX_SOURCES);
    expect(sources[0]).toMatchObject({ url: 'https://site0.com', title: 'dupe first' });
    expect(sources.some((s) => s.url.startsWith('javascript'))).toBe(false);
  });

  it('skips annotations of other kinds and survives junk', () => {
    expect(readWebSources([{ type: 'file_citation', url: 'https://x.com' }, null, 4])).toEqual([]);
    expect(readWebSources(undefined)).toEqual([]);
  });
});

describe('trimSnippet', () => {
  it('cuts at a word near the cap', () => {
    const text = 'word '.repeat(300);
    const trimmed = trimSnippet(text, 50);
    expect(trimmed.length).toBeLessThanOrEqual(51);
    expect(trimmed.endsWith('…')).toBe(true);
    expect(trimmed).not.toMatch(/wor…$/);
  });
});

describe('hostOf and readCostUsd', () => {
  it('reads a host without throwing on junk', () => {
    expect(hostOf('https://www.nytimes.com/2026/books')).toBe('nytimes.com');
    expect(hostOf('not a url')).toBe('not a url');
  });

  it('reads a reported cost and ignores anything else', () => {
    expect(readCostUsd({ cost: 0.0123 })).toBe(0.0123);
    expect(readCostUsd({ cost: -1 })).toBeNull();
    expect(readCostUsd(undefined)).toBeNull();
  });
});
