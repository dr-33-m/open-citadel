/**
 * The pieces every generated EPUB shares: the container, a language tag XML
 * accepts, escaping and the modified stamp. Pure; `write.ts` puts a package
 * on disk.
 *
 * The app writes EPUBs for things that are not books so the reader, and
 * everything downstream of it (Samwell's search, highlights, Compass), can
 * reach them with no code of their own: a blog post (`services/blogs`), a
 * podcast transcript (`services/podcasts/transcript`).
 */
export const EPUB_CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

/** A language tag XML accepts, from whatever the source said ("en-US", "EN", nothing). */
export function languageTag(language: string | null): string {
  const tag = (language ?? '').trim().replace(/_/g, '-');
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(tag) ? tag : 'en';
}

/** `dcterms:modified`, as EPUB 3 wants it: to the second, in UTC. */
export function epubModified(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
