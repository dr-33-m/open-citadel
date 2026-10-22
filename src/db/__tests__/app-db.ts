import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/expo-sqlite/driver';

import * as schema from '@/db/schema';

/**
 * The app's database for a test: Node's own SQLite behind the same drizzle
 * driver the app uses (its driver module alone: the package's index brings in
 * one that needs expo-sqlite). expo-sqlite's synchronous calls are the four
 * drizzle makes, answered by node:sqlite, so a query runs here exactly as it
 * is written for the phone.
 *
 * Empty until `migrateAppDb` has run the app's own migrations on it.
 *
 * Double-quoted strings are allowed, as on the phone: an early migration
 * copies a column that was never there by its quoted name, which SQLite
 * reads as a string, and Node's build refuses by default.
 */
export function appDb() {
  const sqlite = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });

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

/**
 * Brings the mocked `@/db/client` to the shape the app starts with: the
 * migration chain and the self-healing steps after it, by the app's own
 * `runMigrations`, so a column added outside `drizzle/` is there too.
 */
export async function migrateAppDb(): Promise<void> {
  const { runMigrations } = await import('@/db/migrations');
  await runMigrations();
}
