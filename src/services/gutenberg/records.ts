/**
 * Project Gutenberg's books as the app holds them, and the small decisions
 * about them. Pure: no React Native, no I/O, so all of it is tested.
 *
 * What the app may do with them is set by Gutenberg's own policies
 * (gutenberg.org/policy/terms_of_use.html, license.html, robot_access.html),
 * and the rules that follow from them live here so no screen can drift:
 *
 * - The catalogue is read from Samwell Cloud's Gutendex, built from the bulk
 *   catalogue Gutenberg publishes for this use, never from its web pages.
 * - A book is offered for download only when the catalogue marks it public
 *   domain in the USA (`canDownload`). The few still under copyright are
 *   shared with Gutenberg by permission, and that permission is not ours to
 *   pass on, so those link to their page instead.
 * - The file is Gutenberg's, unmodified, license header and all.
 * - Links out go to a book's landing page, never to a file.
 */
import type { CatalogBook, CatalogBookDetail, CatalogPage, CatalogSort } from 'samwell-shared';

import { safeFileStem } from '@/utils/file-names';

export type { CatalogBook, CatalogBookDetail, CatalogPage };

export const GUTENBERG_ORIGIN = 'https://www.gutenberg.org';

/** The book's page on Gutenberg: the only address its policy asks apps to link to. */
export function landingUrl(id: number): string {
  return `${GUTENBERG_ORIGIN}/ebooks/${id}`;
}

/** Only a public-domain book with an EPUB is downloaded. See the note at the top. */
export function canDownload(book: Pick<CatalogBookDetail, 'publicDomain' | 'epubUrl'>): boolean {
  return book.publicDomain === true && !!book.epubUrl;
}

/** What a list is asked for: a shelf's topic or a search, its order, and the page. */
export type CatalogListQuery = { topic?: string; search?: string; sort?: CatalogSort; page: number };

/** A list's path on the catalogue routes, leaving out what was not asked. */
export function catalogListPath(query: CatalogListQuery): string {
  const params = [`page=${query.page}`];
  if (query.topic) params.push(`topic=${encodeURIComponent(query.topic)}`);
  if (query.search) params.push(`search=${encodeURIComponent(query.search)}`);
  if (query.sort) params.push(`sort=${query.sort}`);
  return `/books?${params.join('&')}`;
}

/**
 * A downloaded book's file name: its title, made safe for a URL, then its
 * eBook number. The number is what lets the Library say a book is already
 * there (`gutenbergIdFromUri`).
 */
export function epubFileName(title: string, id: number): string {
  return `${safeFileStem(title, 60)}-pg${id}.epub`;
}

/**
 * The eBook number in a library file's address, if it came from here.
 *
 * Android's folder may have added ` (1)` to a name that was taken, and its
 * addresses are percent-encoded, so both are allowed for.
 */
export function gutenbergIdFromUri(uri: string | null | undefined): number | null {
  if (!uri) return null;
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    // A malformed escape: match against it as it is.
  }
  const match = decoded.match(/-pg(\d+)(?: \(\d+\))?\.epub$/i);
  return match ? Number(match[1]) : null;
}

