import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The migration chain has to survive a database that has never been migrated.
 *
 * This is a static check, not a database one, and it exists because the failure
 * it catches is invisible on every machine that already has the app. Drizzle
 * applies the whole chain inside ONE transaction, so a single statement that
 * cannot run takes every migration before it down with it and the app starts
 * against an empty database. An install that has been upgrading for months
 * never replays the chain, so nobody sees it until somebody installs fresh.
 *
 * That is exactly what happened: `0018_trackables.sql` alters `chat_sessions`,
 * which no migration has ever created. It was created by a self-heal that runs
 * AFTER the migrator, which is fine on a database that already had the table
 * and useless on one that does not. `runMigrations` now creates it first (see
 * `ensureChatSessionsTable`), and this test is what stops the hole reopening.
 */

const MIGRATIONS_DIR = join(__dirname, '../../../drizzle');

/**
 * Tables created before the migrator runs, and therefore legitimately alterable
 * by a migration without any migration creating them.
 *
 * Adding a name here is a deliberate act: it means `runMigrations` creates the
 * table itself, ahead of `migrate()`. If a migration alters something not in
 * this set and not created by an earlier migration, the chain is broken.
 */
const CREATED_BEFORE_MIGRATOR = new Set(['chat_sessions']);

type Statement = { file: string; table: string };

function readMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }));
}

function tablesMatching(sql: string, pattern: RegExp): string[] {
  return [...sql.matchAll(pattern)].map((m) => m[1]);
}

describe('drizzle migration chain', () => {
  const files = readMigrations();

  it('has migrations to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never alters a table that does not exist yet', () => {
    const created = new Set(CREATED_BEFORE_MIGRATOR);
    const broken: Statement[] = [];

    for (const { name, sql } of files) {
      // Within one file, statements run top to bottom, so a table created
      // earlier in the same file is available to an ALTER later in it. Reading
      // creates before alters per file matches that.
      for (const table of tablesMatching(
        sql,
        /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?/gi,
      )) {
        created.add(table);
      }
      for (const table of tablesMatching(sql, /ALTER TABLE\s+`?(\w+)`?/gi)) {
        if (!created.has(table)) broken.push({ file: name, table });
      }
    }

    expect(
      broken,
      broken
        .map(
          (b) =>
            `${b.file} alters \`${b.table}\`, which no earlier migration creates. ` +
            'Either add its CREATE to a migration, or create it in `runMigrations` ' +
            'before `migrate()` and list it in CREATED_BEFORE_MIGRATOR.',
        )
        .join('\n'),
    ).toEqual([]);
  });

  it('does not re-create a table that runMigrations already made', () => {
    /*
     * The mirror of the check above, and the way the fix for it goes wrong.
     *
     * A table created before the migrator must NOT also be created by a
     * migration: drizzle generates bare `CREATE TABLE`, so the second one
     * fails with "table already exists" and takes the whole chain down in the
     * other direction.
     */
    const clashes: Statement[] = [];
    for (const { name, sql } of files) {
      for (const [, table] of sql.matchAll(/CREATE TABLE\s+`?(\w+)`?/gi)) {
        if (CREATED_BEFORE_MIGRATOR.has(table)) clashes.push({ file: name, table });
      }
    }
    expect(
      clashes,
      clashes
        .map((c) => `${c.file} creates \`${c.table}\`, which runMigrations creates first.`)
        .join('\n'),
    ).toEqual([]);
  });
});
