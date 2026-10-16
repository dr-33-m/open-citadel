import { INDEX_VERSION } from '@/services/book-text/schema';
import type { ReadableExtent } from '@/services/book-text/extent';
import type { ParagraphHit, SqlDriver, SqlValue } from '@/services/book-text/store';

/** Standing in for "the whole section" where SQL wants a number. */
const WHOLE = Number.MAX_SAFE_INTEGER;

/** One book a search may look in, and how far into it. */
export interface SearchScope {
  bookId: string;
  extent: ReadableExtent;
  /** Only this section, when the search is inside one chapter. */
  section?: number;
}

/** Up to this many books, one exact query is fastest; past it, the ranked pool is. */
const EXACT_SCOPES = 24;
/** Best-ranked matches the pool takes before the per-book limits are applied. */
const POOL = 2_000;
/** Short paragraphs (headings, captions) win on length alone in BM25; they are kept but placed behind passages with something in them. */
const SHORT_PENALTY = 'CASE WHEN length(p.text) < 60 THEN 3 ELSE 0 END';

type HitRow = { book_id: string; section: number; n: number; start: number; text: string; title: string | null };

const toHit = (row: HitRow): ParagraphHit => ({
  bookId: row.book_id,
  section: row.section,
  n: row.n,
  start: row.start,
  text: row.text,
  sectionTitle: row.title,
});

/** Whether a paragraph starting at `start` of `section` is before the reader in this scope. */
function inScope(scope: SearchScope, section: number, start: number): boolean {
  if (scope.section !== undefined && section !== scope.section) return false;
  const { lastSection, lastSectionChars } = scope.extent;
  return section < lastSection || (section === lastSection && start < lastSectionChars);
}

/**
 * Paragraphs matching an FTS5 expression, best first, inside the books given
 * and never past where the reader has got in each. Front matter is left out,
 * and so is a book still being written (no `indexed_books` row yet).
 * A paragraph that straddles the reader's position is returned whole here;
 * the caller cuts it (`readablePart`), since only it can tell whether the
 * match fell before the cut.
 *
 * Over a whole library (hundreds of books) a condition per book made SQLite
 * test every match against every book: 0.85s on a desktop for a common word
 * across 451 books. So a wide search ranks inside the full-text table first,
 * takes the best `POOL` matches as bare places, applies the books and the
 * reader's positions to those in memory, and fetches the text of only the few
 * kept: 0.08s for the same search. When the pool runs out before the limit
 * is met with more matches left (a reader early in the books the best matches
 * are in), the exact query runs, so nothing is missed.
 */
export async function searchParagraphs(
  driver: SqlDriver,
  match: string,
  scopes: readonly SearchScope[],
  limit: number,
): Promise<ParagraphHit[]> {
  const readable = scopes.filter((scope) => scope.extent.lastSection >= 0);
  if (readable.length === 0) return [];
  if (readable.length > EXACT_SCOPES) {
    const pooled = await searchPool(driver, match, readable, limit);
    if (pooled) return pooled;
  }
  return searchExact(driver, match, readable, limit);
}

/** The ranked pool, or null when it ran short with more matches beyond it. */
async function searchPool(driver: SqlDriver, match: string, scopes: readonly SearchScope[], limit: number): Promise<ParagraphHit[] | null> {
  const places = await driver.all<{ id: number; book_id: string; section: number; start: number }>(
    `WITH best AS (
       SELECT rowid AS id, bm25(paragraph_fts) AS score FROM paragraph_fts WHERE paragraph_fts MATCH ? ORDER BY score LIMIT ?
     )
     SELECT p.id, p.book_id, p.section, p.start
       FROM best
       JOIN paragraphs p ON p.id = best.id
       JOIN sections s ON s.book_id = p.book_id AND s.idx = p.section AND s.front_matter = 0
       JOIN indexed_books i ON i.book_id = p.book_id AND i.version = ?
      ORDER BY best.score + ${SHORT_PENALTY}`,
    [match, POOL, INDEX_VERSION],
  );
  const byBook = new Map(scopes.map((scope) => [scope.bookId, scope]));
  const kept: number[] = [];
  for (const place of places) {
    const scope = byBook.get(place.book_id);
    if (scope && inScope(scope, place.section, place.start)) kept.push(place.id);
    if (kept.length >= limit) break;
  }
  // Short of the limit, the pool is the answer only if it held every match
  // there is. Counted rather than read off the pool's size, which the front
  // matter dropped from it makes look smaller than it was.
  if (kept.length < limit) {
    const total = await driver.all<{ n: number }>('SELECT count(*) AS n FROM paragraph_fts WHERE paragraph_fts MATCH ?', [match]);
    if ((total[0]?.n ?? 0) > POOL) return null;
  }
  if (kept.length === 0) return [];
  const rows = await driver.all<HitRow & { id: number }>(
    `SELECT p.id, p.book_id, p.section, p.n, p.start, p.text, s.title
       FROM paragraphs p JOIN sections s ON s.book_id = p.book_id AND s.idx = p.section
      WHERE p.id IN (${kept.map(() => '?').join(', ')})`,
    kept,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return kept.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toHit(row)] : [];
  });
}

/** One query with a condition per book: exact, and fastest for a few books. Exported so tests can hold the pool to it. */
export async function searchExact(driver: SqlDriver, match: string, scopes: readonly SearchScope[], limit: number): Promise<ParagraphHit[]> {
  const clauses: string[] = [];
  const params: SqlValue[] = [INDEX_VERSION, match];
  for (const { bookId, extent, section } of scopes) {
    const chars = Number.isFinite(extent.lastSectionChars) ? extent.lastSectionChars : WHOLE;
    const last = Math.min(extent.lastSection, WHOLE);
    clauses.push(`(p.book_id = ? AND (p.section < ? OR (p.section = ? AND p.start < ?))${section === undefined ? '' : ' AND p.section = ?'})`);
    params.push(bookId, last, last, chars);
    if (section !== undefined) params.push(section);
  }
  params.push(limit);
  const rows = await driver.all<HitRow>(
    `SELECT p.book_id, p.section, p.n, p.start, p.text, s.title
       FROM paragraph_fts
       JOIN paragraphs p ON p.id = paragraph_fts.rowid
       JOIN sections s ON s.book_id = p.book_id AND s.idx = p.section
       JOIN indexed_books i ON i.book_id = p.book_id AND i.version = ?
      WHERE paragraph_fts MATCH ? AND s.front_matter = 0 AND (${clauses.join(' OR ')})
      ORDER BY bm25(paragraph_fts) + ${SHORT_PENALTY}
      LIMIT ?`,
    params,
  );
  return rows.map(toHit);
}
