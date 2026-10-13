import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CREDIT_PLANS, creditValueUsd } from 'samwell-shared';

import { createBillingService, type BillingService } from '../billing.js';
import { ensureBillingSchema, USAGE_EVENTS_DDL } from '../db.js';
import { createSpeechCharging, creditNano, usdToNano, type SpeechCharging } from '../tts-billing.js';

/*
 * Against a real SQLite file, like the billing suite: what is under test is
 * two settles racing for the same credit, and a mock would agree with itself.
 */

const NOW = 1_757_400_000_000;
const ACCOUNT = 'account:listener';
const GUEST = 'guest:0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55';
const CREDIT = creditValueUsd(CREDIT_PLANS.grand_maester);

let client: Client;
let billing: BillingService;
let charging: SpeechCharging;
let dir: string;
let seq = 0;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'samwell-tts-billing-'));
  client = createClient({ url: `file:${join(dir, 'test.db')}` });
  await client.execute(USAGE_EVENTS_DDL);
  await ensureBillingSchema(client);
  billing = createBillingService({ client, now: () => NOW });
  charging = createSpeechCharging({ client, billing, now: () => NOW });
});

afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

async function seedAccount(balance: number, account = ACCOUNT): Promise<void> {
  await client.execute({
    sql: `INSERT INTO account_credits (account_id, plan, source, balance, reserved, updated_at_ms)
          VALUES (?, 'grand_maester', 'subscription', ?, 0, ?)`,
    args: [account, balance, NOW],
  });
}

/** An event with its one-credit hold, as `/tts/speak` opens it. */
async function openPiece(account = ACCOUNT): Promise<string> {
  const id = `tts-${++seq}`;
  await client.execute({
    sql: `INSERT INTO usage_events (id, account_id, model_id, status, counts_toward_limit, kind, created_at_ms)
          VALUES (?, ?, 'hexgrad/kokoro-82m', 'started', 1, 'tts', ?)`,
    args: [id, account, NOW],
  });
  const reserve = await billing.reserveCredits({ accountId: account, usageEventId: id, credits: 1 });
  expect(reserve.allowed).toBe(true);
  return id;
}

async function balance(account = ACCOUNT): Promise<{ balance: number; reserved: number }> {
  const result = await client.execute({
    sql: 'SELECT balance, reserved FROM account_credits WHERE account_id = ?',
    args: [account],
  });
  return { balance: Number(result.rows[0].balance), reserved: Number(result.rows[0].reserved) };
}

async function ledgerRows(account = ACCOUNT): Promise<{ credits: number }[]> {
  const result = await client.execute({
    sql: 'SELECT credits FROM credit_ledger WHERE account_id = ?',
    args: [account],
  });
  return result.rows.map((row) => ({ credits: Number(row.credits) }));
}

describe('units', () => {
  it('counts money in whole nano-dollars, and nonsense as nothing', () => {
    expect(usdToNano(0.0008)).toBe(800_000);
    expect(usdToNano(-1)).toBe(0);
    expect(usdToNano(Number.NaN)).toBe(0);
  });

  it('derives a credit from the plan', () => {
    expect(creditNano('grand_maester')).toBe(Math.round(CREDIT * 1e9));
  });
});

describe('the running remainder', () => {
  it('charges nothing for a piece worth less than a credit, and writes no ledger row', async () => {
    await seedAccount(100);
    const id = await openPiece();
    const result = await charging.settleSpeech({
      usageEventId: id,
      accountId: ACCOUNT,
      plan: 'grand_maester',
      costUsd: CREDIT * 0.4,
    });
    expect(result).toEqual({ settled: true, debited: 0 });
    // The hold is released, the balance has not moved, and the ledger agrees.
    expect(await balance()).toEqual({ balance: 100, reserved: 0 });
    expect(await ledgerRows()).toEqual([]);
    expect(await charging.pendingNano(ACCOUNT)).toBe(usdToNano(CREDIT * 0.4));
  });

  it('debits a whole credit once the fractions add up to one', async () => {
    await seedAccount(100);
    const debits: number[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await openPiece();
      const result = await charging.settleSpeech({
        usageEventId: id,
        accountId: ACCOUNT,
        plan: 'grand_maester',
        costUsd: CREDIT * 0.4,
      });
      debits.push(result.debited);
    }
    // 0.4, 0.8, then 1.2: the third piece crosses and takes one.
    expect(debits).toEqual([0, 0, 1]);
    expect((await balance()).balance).toBe(99);
    expect(await ledgerRows()).toEqual([{ credits: -1 }]);
    expect(await charging.pendingNano(ACCOUNT)).toBe(usdToNano(CREDIT * 1.2) - creditNano('grand_maester'));
  });

  it('charges a dear piece every credit it cost', async () => {
    await seedAccount(100);
    const id = await openPiece();
    const result = await charging.settleSpeech({
      usageEventId: id,
      accountId: ACCOUNT,
      plan: 'grand_maester',
      costUsd: CREDIT * 7.5,
    });
    expect(result.debited).toBe(7);
    expect((await balance()).balance).toBe(93);
  });

  it('matches the real cost to within one Neuron over a chapter', async () => {
    // A chapter of uneven sentences at Gemini Flash Lite's price, settled two
    // at a time as the app's two-ahead fetch would.
    await seedAccount(10_000);
    const costs = Array.from({ length: 240 }, (_, i) => ((60 + ((i * 37) % 140)) / 1e6) * 10.125);
    let total = 0;
    for (let i = 0; i < costs.length; i += 2) {
      const pair = costs.slice(i, i + 2);
      const ids = await Promise.all(pair.map(() => openPiece()));
      await Promise.all(
        pair.map((costUsd, k) =>
          charging.settleSpeech({ usageEventId: ids[k], accountId: ACCOUNT, plan: 'grand_maester', costUsd }),
        ),
      );
      total += pair.reduce((a, b) => a + b, 0);
    }
    const charged = 10_000 - (await balance()).balance;
    const owed = total / CREDIT;
    expect(charged).toBeLessThanOrEqual(owed);
    expect(owed - charged).toBeLessThan(1);
    expect((await balance()).reserved).toBe(0);
    // 240 pieces, each several writes to a real file: slow on a slow disk.
  }, 60_000);

  it('never lets two racing settles both debit the same credit', async () => {
    await seedAccount(100);
    // 0.9 already pending, then two pieces of 0.6 land at once: 2.1 in all,
    // so exactly two credits leave, never three or four.
    const first = await openPiece();
    await charging.settleSpeech({ usageEventId: first, accountId: ACCOUNT, plan: 'grand_maester', costUsd: CREDIT * 0.9 });
    const [a, b] = [await openPiece(), await openPiece()];
    const results = await Promise.all([
      charging.settleSpeech({ usageEventId: a, accountId: ACCOUNT, plan: 'grand_maester', costUsd: CREDIT * 0.6 }),
      charging.settleSpeech({ usageEventId: b, accountId: ACCOUNT, plan: 'grand_maester', costUsd: CREDIT * 0.6 }),
    ]);
    expect(results.reduce((sum, r) => sum + r.debited, 0)).toBe(2);
    expect((await balance()).balance).toBe(98);
    const pending = await charging.pendingNano(ACCOUNT);
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(pending).toBeLessThan(creditNano('grand_maester'));
  });

  it('puts claimed credits back when the event was already closed', async () => {
    await seedAccount(100);
    const id = await openPiece();
    await billing.releaseReservation({ usageEventId: id, error: 'swept' });
    const result = await charging.settleSpeech({
      usageEventId: id,
      accountId: ACCOUNT,
      plan: 'grand_maester',
      costUsd: CREDIT * 2.5,
    });
    expect(result).toEqual({ settled: false, debited: 0 });
    expect((await balance()).balance).toBe(100);
    // Still owed, so still on the remainder for the next piece to collect.
    expect(await charging.pendingNano(ACCOUNT)).toBe(usdToNano(CREDIT * 2.5));
  });
});

describe('the remainder follows the reader', () => {
  it('moves from a guest to the account it links to', async () => {
    await client.execute({
      sql: `INSERT INTO guest_identities (guest_id, secret_sha256, created_at_ms) VALUES (?, ?, ?)`,
      args: [GUEST, 'x'.repeat(64), NOW],
    });
    await seedAccount(50, GUEST);
    const id = await openPiece(GUEST);
    await charging.settleSpeech({ usageEventId: id, accountId: GUEST, plan: 'grand_maester', costUsd: CREDIT * 0.7 });

    const linked = await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });
    expect(linked.linked).toBe(true);
    expect(await charging.pendingNano(ACCOUNT)).toBe(usdToNano(CREDIT * 0.7));
    expect(await charging.pendingNano(GUEST)).toBe(0);
  });

  it('adds to what the account already owes rather than replacing it', async () => {
    await client.execute({
      sql: `INSERT INTO guest_identities (guest_id, secret_sha256, created_at_ms) VALUES (?, ?, ?)`,
      args: [GUEST, 'x'.repeat(64), NOW],
    });
    await client.batch(
      [
        { sql: 'INSERT INTO tts_spend VALUES (?, 300000, ?)', args: [GUEST, NOW] },
        { sql: 'INSERT INTO tts_spend VALUES (?, 200000, ?)', args: [ACCOUNT, NOW] },
      ],
      'write',
    );
    await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });
    expect(await charging.pendingNano(ACCOUNT)).toBe(500_000);
  });
});

describe('chat is unchanged', () => {
  it('still writes a ledger row for a turn that cost nothing', async () => {
    await seedAccount(100);
    const id = await openPiece();
    await billing.settleCredits({ usageEventId: id, actualCredits: 0 });
    expect((await ledgerRows()).map((row) => Math.abs(row.credits))).toEqual([0]);
  });
});
