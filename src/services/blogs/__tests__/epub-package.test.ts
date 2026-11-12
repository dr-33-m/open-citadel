import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';

import { articleEpubFiles } from '@/services/blogs/epub/package';

const INPUT = {
  id: 'a1',
  title: 'Maps & <Territories>',
  blogTitle: 'Farnam Street',
  author: 'Shane Parrish',
  publishedAt: '2024-05-06T07:08:09.000Z',
  language: 'en_US',
  link: 'https://www.fs.blog/map/?a=1&b=2',
  bodyXhtml: '<p>The whole post.</p>',
};

describe('articleEpubFiles', () => {
  const files = articleEpubFiles(INPUT);

  it('has the files an EPUB 3 needs, the marker first', () => {
    expect(Object.keys(files)).toEqual([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/content.opf',
      'OEBPS/nav.xhtml',
      'OEBPS/article.xhtml',
    ]);
    expect(files.mimetype).toBe('application/epub+zip');
  });

  it('writes every XML file well-formed, whatever the title holds', () => {
    for (const [name, body] of Object.entries(files)) {
      if (name === 'mimetype') continue;
      expect(XMLValidator.validate(body), name).toBe(true);
    }
  });

  it('credits the blog and the writer, and links the original', () => {
    const article = files['OEBPS/article.xhtml'];
    expect(article).toContain('<small>FARNAM STREET</small>');
    expect(article).toContain('<h1>Maps &amp; &lt;Territories&gt;</h1>');
    expect(article).toContain('Shane Parrish');
    expect(article).toContain('href="https://www.fs.blog/map/?a=1&amp;b=2"');
    expect(article).toContain('>fs.blog</a>');
    expect(files['OEBPS/content.opf']).toContain('<dc:source>https://www.fs.blog/map/?a=1&amp;b=2</dc:source>');
  });

  it("carries the publisher's copyright line, and says when it holds only the opening", () => {
    const ruled = articleEpubFiles({ ...INPUT, rights: '© 2026 Farnam Street & Co', opening: true });
    expect(XMLValidator.validate(ruled['OEBPS/content.opf'])).toBe(true);
    expect(XMLValidator.validate(ruled['OEBPS/article.xhtml'])).toBe(true);
    expect(ruled['OEBPS/content.opf']).toContain('<dc:rights>© 2026 Farnam Street &amp; Co</dc:rights>');
    expect(ruled['OEBPS/article.xhtml']).toContain('© 2026 Farnam Street &amp; Co');
    expect(ruled['OEBPS/article.xhtml']).toContain('This is the start of the post. Read the rest on');
    expect(files['OEBPS/content.opf']).not.toContain('dc:rights');
    expect(files['OEBPS/article.xhtml']).toContain('Read the original on');
  });

  it('cleans the language tag, and falls back to English', () => {
    expect(files['OEBPS/content.opf']).toContain('<dc:language>en-US</dc:language>');
    expect(articleEpubFiles({ ...INPUT, language: 'not a tag' })['OEBPS/content.opf']).toContain(
      '<dc:language>en</dc:language>',
    );
  });
});
