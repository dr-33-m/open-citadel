import type { SqlDriver } from '@/services/book-text/sql-driver';

/**
 * Raised whenever what is stored, or how it is cut into paragraphs, changes:
 * a book indexed under another version is indexed again on its next use.
 */
export const INDEX_VERSION = 1;

/**
 * Its own database file, not a table in the app's: the index is a cache that
 * can be thrown away and built again from the books at any time, so it has
 * no migrations to keep in step with the app's.
 *
 * Paragraphs are the unit, because they are what Samwell cites and reads
 * from: a search answers with a paragraph's number, and reading picks up at
 * one. The full-text table reads its text from `paragraphs` (external
 * content), so nothing is stored twice; Porter stemming lets "leading" find
 * "leaders", and diacritics are ignored.
 */
export const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS indexed_books (
  book_id TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL,
  version INTEGER NOT NULL,
  indexed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sections (
  book_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  href TEXT NOT NULL,
  title TEXT,
  front_matter INTEGER NOT NULL,
  paragraphs INTEGER NOT NULL,
  chars INTEGER NOT NULL,
  PRIMARY KEY (book_id, idx)
);
CREATE TABLE IF NOT EXISTS paragraphs (
  id INTEGER PRIMARY KEY,
  book_id TEXT NOT NULL,
  section INTEGER NOT NULL,
  n INTEGER NOT NULL,
  start INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS paragraphs_place ON paragraphs (book_id, section, n);
CREATE VIRTUAL TABLE IF NOT EXISTS paragraph_fts USING fts5(
  text, content = 'paragraphs', content_rowid = 'id', tokenize = 'porter unicode61 remove_diacritics 2'
);
`;

/** Creates the index's tables where they are missing. */
export async function prepareIndex(driver: SqlDriver): Promise<void> {
  await driver.exec(SCHEMA);
}
