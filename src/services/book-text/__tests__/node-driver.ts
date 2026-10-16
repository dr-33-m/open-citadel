import { DatabaseSync } from 'node:sqlite';

import type { SqlDriver, SqlValue } from '@/services/book-text/store';

/** The index's driver over Node's own SQLite, which has FTS5: the real SQL, run in a test. */
export function nodeDriver(): SqlDriver {
  const db = new DatabaseSync(':memory:');
  const driver: SqlDriver = {
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params: readonly SqlValue[] = []) => {
      db.prepare(sql).run(...params);
    },
    all: async <T,>(sql: string, params: readonly SqlValue[] = []) => db.prepare(sql).all(...params) as T[],
    transaction: async (work) => {
      db.exec('BEGIN');
      try {
        await work(driver);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return driver;
}
