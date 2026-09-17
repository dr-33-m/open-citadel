import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

/*
 * `db.ts` opens its client at import time from `DATABASE_URL`, so the env is
 * set before the dynamic import rather than after it. A real SQLite file, like
 * the billing tests: what is under test is which rows a batch leaves behind,
 * and a mock would be asserting the statements back at themselves.
 */
const dir = mkdtempSync(join(tmpdir(), 'samwell-account-delete-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;

const { db, deleteAccountData, ensureBillingSchema, initDb } = await import('../db.js');

const ACCOUNT = 'account:leaving-sub';
const KEEPER = 'account:staying-sub';

beforeAll(async () => {
  await initDb();
  await ensureBillingSchema(db);

  for (const account of [ACCOUNT, KEEPER]) {
    await db.batch(
      [
        {
          sql: `INSERT INTO usage_events (id, account_id, model_id, status, counts_toward_limit, kind, created_at_ms)
                VALUES (?, ?, 'model-a', 'completed', 1, 'chat', 1)`,
          args: [`usage-${account}`, account],
        },
        {
          sql: `INSERT INTO account_credits (account_id, plan, source, balance, reserved, updated_at_ms)
                VALUES (?, 'maester', 'subscription', 500, 0, 1)`,
          args: [account],
        },
        {
          sql: `INSERT INTO credit_ledger (id, account_id, type, credits, balance_after, created_at_ms)
                VALUES (?, ?, 'grant', 500, 500, 1)`,
          args: [`ledger-${account}`, account],
        },
        {
          sql: `INSERT INTO onboarding_grants (account_id, turns, started_at_ms) VALUES (?, 2, 1)`,
          args: [account],
        },
        {
          sql: `INSERT INTO insider_invites (code, plan, duration_days, created_at_ms, redeemed_by, redeemed_at_ms)
                VALUES (?, 'archmaester', 30, 1, ?, 1)`,
          args: [`code-${account}`, account],
        },
      ],
      'write',
    );
  }

  await deleteAccountData(ACCOUNT);
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function countFor(table: string, account: string): Promise<number> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM ${table} WHERE account_id = ?`,
    args: [account],
  });
  return Number(result.rows[0].n);
}

const TABLES = ['usage_events', 'account_credits', 'credit_ledger', 'onboarding_grants'];

it('leaves the deleted account no rows', async () => {
  for (const table of TABLES) {
    expect(await countFor(table, ACCOUNT), table).toBe(0);
  }
});

it('touches nobody else', async () => {
  for (const table of TABLES) {
    expect(await countFor(table, KEEPER), table).toBe(1);
  }
});

it('keeps a redeemed invite spent, without the name', async () => {
  const result = await db.execute({
    sql: 'SELECT redeemed_by, redeemed_at_ms FROM insider_invites WHERE code = ?',
    args: [`code-${ACCOUNT}`],
  });
  const row = result.rows[0];
  expect(row.redeemed_by).toBe('deleted-account');
  // Still spent: deleting an account cannot hand the code back.
  expect(row.redeemed_at_ms).not.toBeNull();
});
