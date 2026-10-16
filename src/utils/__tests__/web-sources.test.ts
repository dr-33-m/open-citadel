import { describe, expect, it } from 'vitest';

import { faviconUrl, siteName, sourceSnippet, sourceTitle, stackedSources } from '../web-sources';

const source = (url: string) => ({ title: url, url, snippet: '' });

describe('siteName', () => {
  it('names a site by its own label, without www or the suffix', () => {
    expect(siteName('https://www.bmw-syndikat.de/forum/316i')).toBe('bmw-syndikat');
    expect(siteName('https://drivurs.com/academy/downpipes')).toBe('drivurs');
  });

  it('looks past a country suffix and a language subdomain', () => {
    expect(siteName('https://workshop-manuals.co.uk/bmw')).toBe('workshop-manuals');
    expect(siteName('https://en.wikipedia.org/wiki/BMW_M43')).toBe('wikipedia');
    expect(siteName('https://m.example.com.au/x')).toBe('example');
  });

  it('keeps a bare host whole', () => {
    expect(siteName('http://localhost:3000/a')).toBe('localhost');
  });
});

describe('faviconUrl', () => {
  it('asks for the host only, never the page', () => {
    expect(faviconUrl('https://www.bmw-syndikat.de/forum/316i?x=1')).toBe('https://icons.duckduckgo.com/ip3/bmw-syndikat.de.ico');
  });

  it('has nothing for an address without a host', () => {
    expect(faviconUrl('not a url')).toBeNull();
  });
});

describe('stackedSources', () => {
  it('shows one icon a site, the first few', () => {
    const stacked = stackedSources([
      source('https://a.com/1'),
      source('https://a.com/2'),
      source('https://b.com/1'),
      source('https://c.com/1'),
      source('https://d.com/1'),
      source('https://e.com/1'),
    ]);
    expect(stacked.map((s) => s.url)).toEqual(['https://a.com/1', 'https://b.com/1', 'https://c.com/1', 'https://d.com/1']);
  });
});

describe('sourceTitle', () => {
  it('puts a title broken over lines on one line', () => {
    expect(sourceTitle({ title: '2026\n\n  Ford Mustang', url: 'https://www.ford.com/m', snippet: '' })).toBe('2026 Ford Mustang');
  });

  it('names the site when the title is blank', () => {
    expect(sourceTitle({ title: ' \n ', url: 'https://www.ford.com/m', snippet: '' })).toBe('ford');
  });
});

describe('sourceSnippet', () => {
  it('drops markdown heading marks but keeps a hash in the text', () => {
    const snippet = "## What's New for 2026? ... # 2026 Mustang ... issue #5 is out";
    expect(sourceSnippet({ title: '', url: 'https://a.com', snippet })).toBe("What's New for 2026? ... 2026 Mustang ... issue #5 is out");
  });
});
