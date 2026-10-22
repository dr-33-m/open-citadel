import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/expo-sqlite/driver';

import * as schema from '@/db/schema';

/**
 * The app's database for a test: Node's own SQLite, migrated with the app's
 * own migrations, behind the same drizzle driver the app uses (its driver
 * module alone: the package's index brings in one that needs expo-sqlite).
 * expo-sqlite's synchronous calls are the four drizzle makes, answered by
 * node:sqlite, so a query runs here exactly as it is written for the phone.
 *
 * Double-quoted strings are allowed, as on the phone: an early migration
 * copies a column that was never there by its quoted name, which SQLite
 * reads as a string, and Node's build refuses by default.
 */
export function appDb() {
  const sqlite = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
  // The one table no migration creates, as `ensureChatSessionsTable` in
  // `db/migrations.ts` makes it before the chain runs (0018 alters it).
  sqlite.exec(`CREATE TABLE chat_sessions (
    id text PRIMARY KEY NOT NULL, book_id text, title text NOT NULL, context_text text,
    context_locator text, created_at text NOT NULL, updated_at text NOT NULL
  )`);
  const folder = join(process.cwd(), 'drizzle');
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(join(folder, file), 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }

  const client = {
    prepareSync(sql: string) {
      const statement = sqlite.prepare(sql);
      const args = (params: unknown[]) => params.map((p) => (typeof p === 'boolean' ? Number(p) : p)) as SQLInputValue[];
      return {
        executeSync(params: unknown[]) {
          let result: { changes: number | bigint; lastInsertRowid: number | bigint } | undefined;
          const run = () => (result ??= statement.run(...args(params)));
          return {
            get changes() {
              return Number(run().changes);
            },
            get lastInsertRowId() {
              return Number(run().lastInsertRowid);
            },
            getAllSync: () => statement.all(...args(params)),
            getFirstSync: () => statement.get(...args(params)) ?? null,
          };
        },
        executeForRawResultSync(params: unknown[]) {
          return {
            getAllSync: () => {
              statement.setReturnArrays(true);
              try {
                return statement.all(...args(params));
              } finally {
                statement.setReturnArrays(false);
              }
            },
          };
        },
      };
    },
  };
  return drizzle(client as any, { schema });
}
