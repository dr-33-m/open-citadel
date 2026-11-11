import { describe, expect, it } from 'vitest';

import { extractArticle, pageReservesRights } from '@/services/blogs/full-text';

const LONG = Array.from({ length: 12 }, (_, i) => `<p>Paragraph ${i} ${'of careful, considered prose '.repeat(8)}</p>`).join('');

describe('pageReservesRights', () => {
  it('hears noarchive and noai in the robots tag or header, and a TDM reservation', () => {
    expect(pageReservesRights('<head><meta name="robots" content="index, noarchive"></head>', null)).toBe(true);
    expect(pageReservesRights("<head><meta content='noai' name='ROBOTS'></head>", null)).toBe(true);
    expect(pageReservesRights('<head><meta name="tdm-reservation" content="1"></head>', null)).toBe(true);
    expect(pageReservesRights('<html></html>', 'noai, noimageai')).toBe(true);
    expect(pageReservesRights('<html></html>', null, true)).toBe(true);
  });

  it('lets a page with no such ask be read, and ignores the body', () => {
    expect(pageReservesRights('<head><meta name="robots" content="index, follow"></head>', null)).toBe(false);
    expect(pageReservesRights('<head><meta name="tdm-reservation" content="0"></head>', 'noindex')).toBe(false);
    expect(pageReservesRights('<head></head><body><meta name="robots" content="noarchive"></body>', null)).toBe(false);
    expect(pageReservesRights('<head><meta data-name="robots" content="noarchive"></head>', null)).toBe(false);
  });
});

describe('extractArticle', () => {
  it('pulls the article out of a page, leaving the navigation behind', async () => {
    const page = `<!doctype html><html><head><title>Post</title></head><body>
      <nav><a href="/">Home</a><a href="/about">About</a></nav>
      <article><h1>The Post</h1>${LONG}</article>
      <footer>Copyright and a newsletter signup</footer>
    </body></html>`;
    const content = await extractArticle(page);
    expect(content).toContain('Paragraph 11');
    expect(content).not.toContain('newsletter signup');
  });

  it('finds nothing on a page with no article', async () => {
    expect(await extractArticle('<html><body><nav><a href="/">Home</a></nav></body></html>')).toBeNull();
  });
});
