/**
 * What a book says about itself in its package file.
 *
 * Every EPUB carries Dublin Core metadata in its OPF: the publisher's
 * description (the jacket copy), the publisher, the date, the language, its
 * subjects. The app reads the title and author at import and never the rest,
 * so Samwell asked what an unstarted book was about had nothing to answer from
 * but his own memory of a title. The description is written to be read before
 * the book is, which makes it the one part of an unread book he may quote.
 *
 * Pure regex over the OPF string, like `epub-spine.ts`, so it is tested
 * without a zip.
 */

export interface EpubMetadata {
  title: string | null;
  creators: string[];
  description: string | null;
  publisher: string | null;
  /** As the file gives it: a year, a date, or a timestamp. */
  published: string | null;
  language: string | null;
  subjects: string[];
  isbn: string | null;
}

/** Long enough for any real blurb; past it the description is the book's opening pasted in. */
const DESCRIPTION_MAX_CHARS = 2_000;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Markup and entities out, whitespace to single spaces. Descriptions are often HTML, sometimes escaped twice. */
export function plainText(raw: string): string {
  let text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Escaped markup (&lt;p&gt;) is common in descriptions: unescape it, then strip it.
  for (let pass = 0; pass < 2; pass++) {
    text = text
      .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name: string) => ENTITIES[name] ?? '')
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
    text = text.replace(/<[^>]+>/g, ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

function allOf(opf: string, tag: string): string[] {
  const pattern = new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'gi');
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(opf))) {
    const value = plainText(match[1] ?? '');
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function firstOf(opf: string, tag: string): string | null {
  return allOf(opf, tag)[0] ?? null;
}

/** An ISBN among the identifiers, digits (and a final X) only. */
function findIsbn(opf: string): string | null {
  for (const identifier of allOf(opf, 'identifier')) {
    const digits = identifier.replace(/^urn:isbn:/i, '').replace(/[^0-9X]/gi, '');
    if (/^(97[89])?\d{9}[\dX]$/i.test(digits)) return digits.toUpperCase();
  }
  return null;
}

export function parseOpfMetadata(opf: string): EpubMetadata {
  const description = firstOf(opf, 'description');
  return {
    title: firstOf(opf, 'title'),
    creators: allOf(opf, 'creator'),
    description: description ? description.slice(0, DESCRIPTION_MAX_CHARS) : null,
    publisher: firstOf(opf, 'publisher'),
    published: firstOf(opf, 'date'),
    language: firstOf(opf, 'language'),
    subjects: allOf(opf, 'subject'),
    isbn: findIsbn(opf),
  };
}
