import type { ExtractedSection } from '@/services/book-text/extract';
import { INDEX_VERSION } from '@/services/book-text/schema';
import type { SqlDriver, SqlValue } from '@/services/book-text/sql-driver';

export type { SqlDriver, SqlValue };

/** A section as the index keeps it. */
export interface StoredSection {
  index: number;
  href: string;
  title: string | null;
  frontMatter: boolean;
  paragraphs: number;
  chars: number;
}

/** One paragraph: its number in its section (from 1) and where it starts in the section's text. */
export interface StoredParagraph {
  section: number;
  n: number;
  start: number;
  text: string;
}

/** A paragraph a search found, with where it is. */
export interface ParagraphHit extends StoredParagraph {
  bookId: string;
  sectionTitle: string | null;
}

/** Rows per INSERT: five values each, well under SQLite's 999 parameters. */
const ROWS_PER_INSERT = 150;
/** The paragraph separator `start` counts across. */
const SEPARATOR = 2;

/** The fingerprint a book was indexed under, or null when it is not indexed under this version. */
export async function indexedFingerprint(driver: SqlDriver, bookId: string): Promise<string | null> {
  const rows = await driver.all<{ fingerprint: string }>(
    'SELECT fingerprint FROM indexed_books WHERE book_id = ? AND version = ?',
    [bookId, INDEX_VERSION],
  );
  return rows[0]?.fingerprint ?? null;
}

/** Every book indexed under this version, in one query rather than one a book. */
export async function indexedBookIds(driver: SqlDriver): Promise<Set<string>> {
  const rows = await driver.all<{ book_id: string }>('SELECT book_id FROM indexed_books WHERE version = ?', [INDEX_VERSION]);
  return new Set(rows.map((row) => row.book_id));
}

async function deleteRows(driver: SqlDriver, bookId: string): Promise<void> {
  // External content: the full-text rows are taken out with the text they were made from.
  await driver.run(
    "INSERT INTO paragraph_fts (paragraph_fts, rowid, text) SELECT 'delete', id, text FROM paragraphs WHERE book_id = ?",
    [bookId],
  );
  await driver.run('DELETE FROM paragraphs WHERE book_id = ?', [bookId]);
  await driver.run('DELETE FROM sections WHERE book_id = ?', [bookId]);
  await driver.run('DELETE FROM indexed_books WHERE book_id = ?', [bookId]);
}

/** Takes a book out of the index, when it leaves the library. */
export async function forgetBook(driver: SqlDriver, bookId: string): Promise<void> {
  await driver.transaction((tx) => deleteRows(tx, bookId));
}

/** Replaces a book's index with these sections, in one transaction: a reader never sees half a book. */
export async function writeBook(
  driver: SqlDriver,
  bookId: string,
  fingerprint: string,
  sections: readonly ExtractedSection[],
  indexedAt: string,
): Promise<void> {
  await driver.transaction(async (tx) => {
    await deleteRows(tx, bookId);
    const rows: SqlValue[][] = [];
    for (const section of sections) {
      let start = 0;
      section.paragraphs.forEach((text, i) => {
        rows.push([bookId, section.index, i + 1, start, text]);
        start += text.length + SEPARATOR;
      });
      const chars = Math.max(0, start - SEPARATOR);
      await tx.run(
        'INSERT INTO sections (book_id, idx, href, title, front_matter, paragraphs, chars) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [bookId, section.index, section.href, section.title, section.frontMatter ? 1 : 0, section.paragraphs.length, chars],
      );
    }
    for (let at = 0; at < rows.length; at += ROWS_PER_INSERT) {
      const batch = rows.slice(at, at + ROWS_PER_INSERT);
      await tx.run(
        `INSERT INTO paragraphs (book_id, section, n, start, text) VALUES ${batch.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
        batch.flat(),
      );
    }
    await tx.run('INSERT INTO paragraph_fts (rowid, text) SELECT id, text FROM paragraphs WHERE book_id = ?', [bookId]);
    await tx.run('INSERT INTO indexed_books (book_id, fingerprint, version, indexed_at) VALUES (?, ?, ?, ?)', [
      bookId,
      fingerprint,
      INDEX_VERSION,
      indexedAt,
    ]);
  });
}

export async function sectionsOf(driver: SqlDriver, bookId: string): Promise<StoredSection[]> {
  const rows = await driver.all<{ idx: number; href: string; title: string | null; front_matter: number; paragraphs: number; chars: number }>(
    'SELECT idx, href, title, front_matter, paragraphs, chars FROM sections WHERE book_id = ? ORDER BY idx',
    [bookId],
  );
  return rows.map((row) => ({
    index: row.idx,
    href: row.href,
    title: row.title,
    frontMatter: row.front_matter === 1,
    paragraphs: row.paragraphs,
    chars: row.chars,
  }));
}

/** Paragraphs of one section from number `from` (1-based), at most `limit` of them. */
export async function paragraphsOf(
  driver: SqlDriver,
  bookId: string,
  section: number,
  from: number,
  limit: number,
): Promise<StoredParagraph[]> {
  return driver.all<StoredParagraph>(
    'SELECT section, n, start, text FROM paragraphs WHERE book_id = ? AND section = ? AND n >= ? ORDER BY n LIMIT ?',
    [bookId, section, from, limit],
  );
}
