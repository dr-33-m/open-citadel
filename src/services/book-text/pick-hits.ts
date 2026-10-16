import { readablePart, type ReadableExtent } from '@/services/book-text/extent';
import type { ParagraphHit } from '@/services/book-text/store';
import { excerptAround, matchScore, type SearchQuery } from '@/utils/search-terms';

/** A paragraph the search keeps, cut at the reader and to its excerpt. */
export interface PickedHit {
  bookId: string;
  section: number;
  sectionTitle: string | null;
  paragraph: number;
  text: string;
}

export interface PickOptions {
  limit: number;
  perBook: number;
  excerptChars: number;
}

/**
 * The index's hits, best first, as Samwell is handed them: each cut at the
 * reader's position, at most `perBook` from one book, `limit` in all, and
 * trimmed to an excerpt round the match. Pure.
 *
 * Only a paragraph cut at the reader is checked again, since the words that
 * matched may be on the far side of the cut. A whole one was matched by the
 * index's own stemmer, which finds what the simpler check here misses
 * ("running" in "runs", "cafe" in "café", "assembly line" in
 * "assembly-line"), so checking those again threw good passages away.
 */
export function pickHits(
  found: readonly ParagraphHit[],
  extentOf: (bookId: string) => ReadableExtent | undefined,
  query: SearchQuery,
  { limit, perBook, excerptChars }: PickOptions,
): PickedHit[] {
  const taken = new Map<string, number>();
  const hits: PickedHit[] = [];
  for (const hit of found) {
    if (hits.length >= limit) break;
    const extent = extentOf(hit.bookId);
    const fromBook = taken.get(hit.bookId) ?? 0;
    if (!extent || fromBook >= perBook) continue;
    const text = readablePart(extent, hit.section, hit.start, hit.text);
    if (!text) continue;
    if (text.length < hit.text.length && matchScore(text, query) === 0) continue;
    taken.set(hit.bookId, fromBook + 1);
    hits.push({
      bookId: hit.bookId,
      section: hit.section,
      sectionTitle: hit.sectionTitle,
      paragraph: hit.n,
      text: excerptAround(text, query, excerptChars),
    });
  }
  return hits;
}
