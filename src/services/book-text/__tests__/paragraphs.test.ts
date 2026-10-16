import { describe, expect, it } from 'vitest';

import { htmlToParagraphs, plainText, sectionTitle } from '@/services/book-text/paragraphs';

describe('htmlToParagraphs', () => {
  it('makes one paragraph of each block, and drops the head, scripts and styles', () => {
    const html = `<html><head><title>Ch 1</title><style>p{}</style></head><body>
      <h1>The Beginning</h1>
      <p>It was a <em>bright</em> cold day&nbsp;in April.</p>
      <p>The clocks were<br/>striking thirteen.</p>
      <script>alert(1)</script>
      <ul><li>One</li><li>Two &amp; three</li></ul>
      <blockquote>A quote</blockquote>
    </body></html>`;
    expect(htmlToParagraphs(html)).toEqual([
      'The Beginning',
      'It was a bright cold day in April.',
      'The clocks were striking thirteen.',
      'One',
      'Two & three',
      'A quote',
    ]);
  });

  it('cuts a chapter with no paragraph markup at sentence ends', () => {
    const sentence = 'This sentence goes on for a while to fill the page. ';
    const paragraphs = htmlToParagraphs(`<body>${sentence.repeat(100)}</body>`);
    expect(paragraphs.length).toBeGreaterThan(2);
    expect(paragraphs.every((p) => p.length <= 1_600 && p.endsWith('.'))).toBe(true);
    expect(paragraphs.join(' ')).toBe(sentence.repeat(100).trim());
  });

  it('answers nothing for an empty page', () => {
    expect(htmlToParagraphs('<html><body><div> </div></body></html>')).toEqual([]);
  });
});

describe('sectionTitle', () => {
  it('prefers the document title, then the first heading, and refuses a paragraph', () => {
    expect(sectionTitle('<title>Chapter One</title><h1>Ignored</h1>')).toBe('Chapter One');
    expect(sectionTitle('<h2>The <i>Second</i> Part</h2>')).toBe('The Second Part');
    expect(sectionTitle(`<title>${'x'.repeat(200)}</title>`)).toBeNull();
    expect(sectionTitle('<p>no heading</p>')).toBeNull();
  });
});

describe('plainText', () => {
  it('drops tags and decodes entities onto one line', () => {
    expect(plainText('<p>Caf&#233;\n &amp; <b>more</b></p>')).toBe('Café & more');
  });
});
