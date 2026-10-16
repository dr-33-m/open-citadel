import { describe, expect, it } from 'vitest';

import { parseOpfMetadata, plainText } from '../epub-metadata';

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>The Taste of Luxury</dc:title>
    <dc:creator opf:role="aut">Nadège Forestier</dc:creator>
    <dc:creator>Nazanine Ravaï</dc:creator>
    <dc:description>&lt;p&gt;How &lt;b&gt;Bernard Arnault&lt;/b&gt; built LVMH.&lt;/p&gt;</dc:description>
    <dc:publisher>Bloomsbury</dc:publisher>
    <dc:date>1992-05-01</dc:date>
    <dc:language>en</dc:language>
    <dc:subject>Business</dc:subject>
    <dc:subject>Fashion</dc:subject>
    <dc:subject>Business</dc:subject>
    <dc:identifier id="uuid">urn:uuid:1234</dc:identifier>
    <dc:identifier>urn:isbn:978-1-85626-123-4</dc:identifier>
  </metadata>
</package>`;

describe('parseOpfMetadata', () => {
  it('reads the Dublin Core fields', () => {
    expect(parseOpfMetadata(OPF)).toEqual({
      title: 'The Taste of Luxury',
      creators: ['Nadège Forestier', 'Nazanine Ravaï'],
      description: 'How Bernard Arnault built LVMH.',
      publisher: 'Bloomsbury',
      published: '1992-05-01',
      language: 'en',
      subjects: ['Business', 'Fashion'],
      isbn: '9781856261234',
    });
  });

  it('answers nulls and empty lists for a bare package', () => {
    expect(parseOpfMetadata('<package><metadata></metadata></package>')).toEqual({
      title: null,
      creators: [],
      description: null,
      publisher: null,
      published: null,
      language: null,
      subjects: [],
      isbn: null,
    });
  });
});

describe('plainText', () => {
  it('strips markup, CDATA and numeric entities', () => {
    expect(plainText('<![CDATA[<p>Caf&#233; &amp; <i>more</i></p>]]>')).toBe('Café & more');
  });
});
