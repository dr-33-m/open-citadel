import { describe, expect, it } from 'vitest';

import {
  epubBasename,
  isFrontMatterHref,
  parseGuideBodyStart,
  parseLandmarksBodyStart,
  parseSpine,
  resolveBodyStart,
  resolveReadCutoff,
} from '../epub-spine';

const OPF = `<?xml version="1.0"?>
<package>
  <manifest>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="text/chap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/chap2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="text/chap3.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="cover"/>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="c3"/>
  </spine>
</package>`;

describe('parseSpine', () => {
  it('returns content docs in reading order, resolved against base path, css excluded', () => {
    expect(parseSpine(OPF, 'OEBPS/')).toEqual([
      'OEBPS/cover.xhtml',
      'OEBPS/text/chap1.xhtml',
      'OEBPS/text/chap2.xhtml',
      'OEBPS/text/chap3.xhtml',
    ]);
  });

  it('handles an empty base path and fragment-stripped hrefs', () => {
    const opf = `<manifest><item id="a" href="a.xhtml#frag"/></manifest><spine><itemref idref="a"/></spine>`;
    expect(parseSpine(opf, '')).toEqual(['a.xhtml']);
  });

  it('skips itemrefs whose idref is not in the manifest', () => {
    const opf = `<manifest><item id="a" href="a.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="ghost"/></spine>`;
    expect(parseSpine(opf, '')).toEqual(['a.xhtml']);
  });
});

describe('epubBasename', () => {
  it('takes the filename and strips fragments/encoding', () => {
    expect(epubBasename('OEBPS/text/chap2.xhtml')).toBe('chap2.xhtml');
    expect(epubBasename('a/b%20c.xhtml#x')).toBe('b c.xhtml');
  });
});

describe('resolveReadCutoff (the spoiler boundary)', () => {
  const spine = ['OEBPS/cover.xhtml', 'OEBPS/text/chap1.xhtml', 'OEBPS/text/chap2.xhtml', 'OEBPS/text/chap3.xhtml'];

  it('null locator ⇒ whole book (archived/finished)', () => {
    expect(resolveReadCutoff(spine, null)).toEqual({ cutoffIndex: 3, progression: 1 });
  });

  it('stops at the current chapter and carries its progression', () => {
    expect(
      resolveReadCutoff(spine, { href: 'text/chap2.xhtml', locations: { progression: 0.4 } }),
    ).toEqual({ cutoffIndex: 2, progression: 0.4 });
  });

  it('matches by basename regardless of path prefix', () => {
    expect(
      resolveReadCutoff(spine, { href: 'OEBPS/text/chap1.xhtml', locations: { progression: 1 } }),
    ).toEqual({ cutoffIndex: 1, progression: 1 });
  });

  it('never lets a later chapter leak in (chap1 position excludes chap2/3)', () => {
    const { cutoffIndex } = resolveReadCutoff(spine, {
      href: 'chap1.xhtml',
      locations: { progression: 0.1 },
    });
    expect(cutoffIndex).toBe(1); // chap2 (idx 2) and chap3 (idx 3) are excluded
  });

  it('falls back to totalProgression when the href is not in the spine', () => {
    expect(
      resolveReadCutoff(spine, { href: 'missing.xhtml', locations: { totalProgression: 0.5 } }),
    ).toEqual({ cutoffIndex: 2, progression: 1 });
  });

  it('fails closed (nothing read) when the href is unmatched AND totalProgression is missing, instead of defaulting to the whole book', () => {
    expect(resolveReadCutoff(spine, { href: 'missing.xhtml' })).toEqual({
      cutoffIndex: -1,
      progression: 1,
    });
    expect(resolveReadCutoff(spine, { href: 'missing.xhtml', locations: {} })).toEqual({
      cutoffIndex: -1,
      progression: 1,
    });
  });

  it('empty spine ⇒ nothing readable', () => {
    expect(resolveReadCutoff([], null)).toEqual({ cutoffIndex: -1, progression: 1 });
  });
});

// ── Where the book actually begins ──────────────────────────────────────────

const SPINE = [
  'OEBPS/cover.xhtml',
  'OEBPS/titlepage.xhtml',
  'OEBPS/copyright.xhtml',
  'OEBPS/text/chap1.xhtml',
  'OEBPS/text/chap2.xhtml',
];

describe('isFrontMatterHref', () => {
  it('recognises the usual jacket and apparatus pages', () => {
    expect(isFrontMatterHref('OEBPS/cover.xhtml')).toBe(true);
    expect(isFrontMatterHref('OEBPS/copyright.xhtml')).toBe(true);
    expect(isFrontMatterHref('OEBPS/toc.xhtml')).toBe(true);
  });

  it('leaves chapters alone', () => {
    expect(isFrontMatterHref('OEBPS/text/chap1.xhtml')).toBe(false);
  });
});

describe('parseGuideBodyStart', () => {
  it('takes the publisher’s own declaration of where the text starts', () => {
    const opf = `<package><guide>
      <reference type="cover" href="cover.xhtml"/>
      <reference type="text" href="text/chap1.xhtml"/>
    </guide></package>`;
    expect(parseGuideBodyStart(opf, SPINE)).toBe(3);
  });

  it('reports absence rather than guessing', () => {
    expect(parseGuideBodyStart('<package></package>', SPINE)).toBe(-1);
  });
});

describe('parseLandmarksBodyStart', () => {
  it('reads the EPUB 3 bodymatter landmark', () => {
    const nav = `<nav epub:type="landmarks">
      <ol>
        <li><a epub:type="cover" href="cover.xhtml">Cover</a></li>
        <li><a epub:type="bodymatter" href="text/chap1.xhtml">Start</a></li>
      </ol>
    </nav>`;
    expect(parseLandmarksBodyStart(nav, SPINE)).toBe(3);
  });

  it('reports absence when there is no landmarks nav', () => {
    expect(parseLandmarksBodyStart('<nav epub:type="toc"></nav>', SPINE)).toBe(-1);
  });
});

describe('resolveBodyStart', () => {
  it('prefers the guide over the filename heuristic', () => {
    // The guide points past chap1, which the heuristic would have kept.
    const opf = `<package><guide>
      <reference type="text" href="text/chap2.xhtml"/>
    </guide></package>`;
    expect(resolveBodyStart(opf, SPINE)).toBe(4);
  });

  it('falls back to landmarks when there is no guide', () => {
    const nav = `<nav epub:type="landmarks">
      <li><a epub:type="bodymatter" href="text/chap1.xhtml">Start</a></li>
    </nav>`;
    expect(resolveBodyStart('<package></package>', SPINE, nav)).toBe(3);
  });

  it('falls back to skipping front-matter filenames', () => {
    expect(resolveBodyStart('<package></package>', SPINE)).toBe(3);
  });

  it('keeps the whole book when every section looks like front matter', () => {
    // Better to search jacket copy than to search nothing at all.
    expect(resolveBodyStart('<package></package>', ['OEBPS/cover.xhtml'])).toBe(0);
  });
});
