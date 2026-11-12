import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { prepareIndex } from '@/services/book-text/schema';
import type { SqlDriver } from '@/services/book-text/store';

const FILE = 'book-text.db';

/**
 * The index's database, opened once and on first use, on one connection.
 * Every query is async, so it runs off the JavaScript thread.
 *
 * Writes use a plain transaction on that connection, never
 * `withExclusiveTransactionAsync`: that opens and closes a second connection
 * per transaction, and closing it aborted the app with native heap corruption
 * inside expo-sqlite (`exsqlite3_finalize`, "invalid chunk state") on the
 * emulator, every time a book finished indexing. A plain transaction can see
 * other queries run inside it; that is safe here because the indexer runs one
 * write at a time and a search ignores a book whose `indexed_books` row is
 * not yet written (`searchParagraphs`), which is the last thing a write does.
 */
let opening: Promise<SqlDriver> | null = null;

function over(db: SQLiteDatabase): SqlDriver {
  const driver: SqlDriver = {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      await db.runAsync(sql, [...params]);
    },
    all: <T,>(sql: string, params: readonly (string | number | null)[] = []) => db.getAllAsync<T>(sql, [...params]),
    transaction: (work) => db.withTransactionAsync(() => work(driver)),
  };
  return driver;
}

/**
 * Off, because this database holds an FTS5 table. Left on, closing the
 * connection (which expo-sqlite does to every open database when the
 * JavaScript runtime is torn down: a reload, a Metro restart, an update)
 * walks `sqlite3_next_stmt` and finalizes every statement on it, FTS5's own
 * internal ones included; `sqlite3_close` then disconnects the FTS5 table,
 * which finalizes those same statements again and the app dies in
 * `exsqlite3_finalize` under `fts5FreeVtab`. Nothing here leaves a statement
 * open: every query goes through `runAsync`/`getAllAsync`/`execAsync`, which
 * finalize their own.
 */
const OPEN_OPTIONS = { finalizeUnusedStatementsBeforeClosing: false } as const;

export function bookTextDriver(): Promise<SqlDriver> {
  opening ??= (async () => {
    const driver = over(await openDatabaseAsync(FILE, OPEN_OPTIONS));
    await prepareIndex(driver);
    return driver;
  })().catch((e) => {
    opening = null;
    throw e;
  });
  return opening;
}
