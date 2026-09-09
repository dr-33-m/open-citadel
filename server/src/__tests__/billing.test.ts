import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CREDIT_PLANS, type PlanId } from 'samwell-shared';

import { createBillingService, STALE_RESERVATION_MS, type BillingService } from '../billing.js';
import { ensureBillingSchema, USAGE_EVENTS_DDL } from '../db.js';

/*
 * These tests run against a real SQLite file, because the thing under test is
 * concurrency and crash-ordering, and neither is honest against a mock. A
 * fresh file per test, the exact schema the server self-heals with, and an
 * injectable clock - the same statements production runs, on the same engine.
 */

const NOW = 1_757_400_000_000;
const DAY_MS = 86_400_000;
const FUTURE = NOW + 30 * DAY_MS;
const ACCOUNT = 'account:reader-sub';
const GRANT = CREDIT_PLANS.grand_maester.monthlyCredits;
const CAP = CREDIT_PLANS.grand_maester.rolloverCap;

let nowMs: number;
let client: Client;
let billing: BillingService;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'samwell-billing-'));
  client = createClient({ url: `file:${join(dir, 'test.db')}` });
  await client.execute(USAGE_EVENTS_DDL);
  await ensureBillingSchema(client);
  nowMs = NOW;
  billing = createBillingService({ client, now: () => nowMs });
});

afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

// -- Fixtures ----------------------------------------------------------------

async function seedPlan(args?: {
  plan?: PlanId | null;
  balance?: number;
  reserved?: number;
  periodEndMs?: number | null;
}): Promise<void> {
  await client.execute({
    sql: `INSERT INTO account_credits (
        account_id, plan, source, balance, reserved, period_start_ms, period_end_ms, updated_at_ms
      )
      VALUES (?, ?, 'subscription', ?, ?, ?, ?, ?)`,
    args: [
      ACCOUNT,
      args?.plan === undefined ? 'grand_maester' : args.plan,
      args?.balance ?? 0,
      args?.reserved ?? 0,
      NOW,
      args?.periodEndMs === undefined ? FUTURE : args.periodEndMs,
      NOW,
    ],
  });
}

async function seedEvent(
  id: string,
  args?: { status?: string; createdAtMs?: number; creditsReserved?: number | null },
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO usage_events (id, account_id, model_id, status, counts_toward_limit, created_at_ms, credits_reserved)
          VALUES (?, ?, 'test/model', ?, 1, ?, ?)`,
    args: [id, ACCOUNT, args?.status ?? 'started', args?.createdAtMs ?? nowMs, args?.creditsReserved ?? null],
  });
}

async function accountRow(): Promise<Record<string, unknown> | undefined> {
  const result = await client.execute({
    sql: 'SELECT plan, source, balance, reserved, period_end_ms FROM account_credits WHERE account_id = ?',
    args: [ACCOUNT],
  });
  return result.rows[0];
}

async function eventRow(id: string): Promise<Record<string, unknown> | undefined> {
  const result = await client.execute({
    sql: `SELECT status, error, credits_reserved, credits_charged, input_price_snapshot,
                 output_price_snapshot, prompt_tokens
          FROM usage_events WHERE id = ?`,
    args: [id],
  });
  return result.rows[0];
}

async function ledgerCounts(
  accountId = ACCOUNT,
): Promise<Record<string, number>> {
  const result = await client.execute({
    sql: 'SELECT type, COUNT(*) AS n FROM credit_ledger WHERE account_id = ? GROUP BY type',
    args: [accountId],
  });
  return Object.fromEntries(result.rows.map((row) => [String(row.type), Number(row.n)]));
}

// -- Reserving ---------------------------------------------------------------

describe('reserveCredits', () => {
  it('allows holds up to the balance and refuses past it', async () => {
    await seedPlan({ balance: 1_000 });
    await Promise.all(
      ['a', 'b', 'c'].map((id) => seedEvent(id)),
    );

    expect(await billing.reserveCredits({ accountId: ACCOUNT, usageEventId: 'a', credits: 300 })).toEqual({ allowed: true });
    expect(await billing.reserveCredits({ accountId: ACCOUNT, usageEventId: 'b', credits: 300 })).toEqual({ allowed: true });
    expect(await billing.reserveCredits({ accountId: ACCOUNT, usageEventId: 'c', credits: 300 })).toEqual({ allowed: true });
    expect(
      await billing.reserveCredits({ accountId: ACCOUNT, usageEventId: 'd', credits: 300 }),
    ).toEqual({ allowed: false, reason: 'insufficient_credits', available: 100, required: 300 });

    const row = await accountRow();
    expect(Number(row?.reserved)).toBe(900);
  });

  it('fits exactly N-1 concurrent holds at a balance that fits N-1', async () => {
    // The case the single atomic UPDATE exists for. A read-then-write here
    // lets every request see the same "available" before any of them writes,
    // and the balance is overdrawn - the probe this suite was written from
    // allowed ten holds of 300 against a balance of 1,000.
    await seedPlan({ balance: 1_000 });
    const ids = Array.from({ length: 10 }, (_, i) => `run-${i}`);
    await Promise.all(ids.map((id) => seedEvent(id)));

    const results = await Promise.all(
      ids.map((id) => billing.reserveCredits({ accountId: ACCOUNT, usageEventId: id, credits: 300 })),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);

    const row = await accountRow();
    expect(Number(row?.reserved)).toBe(900);
    // Exactly the winning three events carry the stamp.
    for (const id of ids) {
      const stamped = await eventRow(id);
      if (ids.indexOf(id) < 3) {
        expect(Number(stamped?.credits_reserved)).toBe(300);
      } else {
        expect(stamped?.credits_reserved).toBeNull();
      }
    }
  });

  it('refuses an account with no row as no subscription', async () => {
    expect(
      await billing.reserveCredits({ accountId: ACCOUNT, usageEventId: 'a', credits: 5 }),
    ).toEqual({ allowed: false, reason: 'no_subscription' });
  });

  it('refuses a plan-less row as no subscription, however large the leftover balance', async () => {
    // An expired subscription leaves a cache row behind. The balance on it is
    // a record, not spendable credit.
    await seedPlan({ plan: null, balance: 3_000 });
    await seedEvent('a');
    expect(
      await billing.reserveCredits({ accountId: ACCOUNT, usageEventId: 'a', credits: 1 }),
    ).toEqual({ allowed: false, reason: 'no_subscription' });
    const row = await accountRow();
    expect(Number(row?.reserved)).toBe(0);
  });

  it('stamps the hold onto the usage event', async () => {
    await seedPlan({ balance: 500 });
    await seedEvent('a');
    await billing.reserveCredits({ accountId: ACCOUNT, usageEventId: 'a', credits: 50 });
    expect(Number((await eventRow('a'))?.credits_reserved)).toBe(50);
  });

  it('compensates the hold and throws when the event is missing', async () => {
    // No event was seeded. The hold would otherwise sit untracked and
    // understate the reader's available credits until a reconcile.
    await seedPlan({ balance: 500 });
    await expect(
      billing.reserveCredits({ accountId: ACCOUNT, usageEventId: 'ghost', credits: 50 }),
    ).rejects.toThrow(/missing or no longer 'started'/);
    const row = await accountRow();
    expect(Number(row?.reserved)).toBe(0);
  });
});

// -- Settling ----------------------------------------------------------------

describe('settleCredits', () => {
  it('charges the actual, never the estimate', async () => {
    await seedPlan({ balance: 1_000 });
    await seedEvent('a', { creditsReserved: 300 });

    const result = await billing.settleCredits({
      usageEventId: 'a',
      actualCredits: 120,
      usage: { promptTokens: 5_000, completionTokens: 300, totalTokens: 5_300, costUsd: 0.0096 },
      priceSnapshot: { inputPricePerMillion: 1.4, outputPricePerMillion: 4.4 },
    });

    expect(result).toEqual({ settled: true, balance: 880 });
    const row = await accountRow();
    expect(Number(row?.balance)).toBe(880);
    expect(Number(row?.reserved)).toBe(0);

    const event = await eventRow('a');
    expect(String(event?.status)).toBe('completed');
    expect(Number(event?.credits_charged)).toBe(120);
    expect(Number(event?.input_price_snapshot)).toBeCloseTo(1.4, 10);
    expect(Number(event?.output_price_snapshot)).toBeCloseTo(4.4, 10);
    expect(Number(event?.prompt_tokens)).toBe(5_000);

    const counts = await ledgerCounts();
    expect(counts).toEqual({ AI_USAGE: 1 });
  });

  it('is idempotent - a retried settle touches nothing', async () => {
    await seedPlan({ balance: 1_000 });
    await seedEvent('a', { creditsReserved: 300 });
    await billing.settleCredits({ usageEventId: 'a', actualCredits: 120 });

    expect(await billing.settleCredits({ usageEventId: 'a', actualCredits: 120 })).toEqual({ settled: false });
    expect(Number((await accountRow())?.balance)).toBe(880);
    expect(await ledgerCounts()).toEqual({ AI_USAGE: 1 });
  });

  it('does nothing for an event it does not know', async () => {
    await seedPlan({ balance: 1_000 });
    expect(await billing.settleCredits({ usageEventId: 'ghost', actualCredits: 50 })).toEqual({ settled: false });
    expect(Number((await accountRow())?.balance)).toBe(1_000);
    expect(await ledgerCounts()).toEqual({});
  });

  it('debits the actual even when it exceeds the estimate', async () => {
    // The reservation is a hold against concurrency, not a ceiling on the
    // charge: the real cost is authoritative, and a run that cost more than
    // was estimated is billed for what it cost.
    await seedPlan({ balance: 1_000 });
    await seedEvent('a', { creditsReserved: 100 });
    const result = await billing.settleCredits({ usageEventId: 'a', actualCredits: 250 });
    expect(result).toEqual({ settled: true, balance: 750 });
  });

  it('marks the event and writes no ledger row when the account row has vanished', async () => {
    // A wiring bug, not a reader condition - settling a turn for an account
    // that never held a cache row. The gate has already fired, so the event
    // cannot be double-charged; the missing debit is said loudly and nothing
    // is invented in the ledger.
    await seedEvent('a', { creditsReserved: 50 });
    await client.execute({ sql: 'DELETE FROM account_credits WHERE account_id = ?', args: [ACCOUNT] });

    expect(await billing.settleCredits({ usageEventId: 'a', actualCredits: 20 })).toEqual({ settled: true, balance: 0 });
    expect(String((await eventRow('a'))?.status)).toBe('completed');
    expect(await ledgerCounts()).toEqual({});
  });
});

// -- Releasing ---------------------------------------------------------------

describe('releaseReservation', () => {
  it('returns the hold and leaves the balance alone', async () => {
    await seedPlan({ balance: 1_000 });
    await seedEvent('a', { creditsReserved: 300 });

    expect(await billing.releaseReservation({ usageEventId: 'a', error: 'boom' })).toBe(true);

    const row = await accountRow();
    expect(Number(row?.balance)).toBe(1_000);
    expect(Number(row?.reserved)).toBe(0);
    const event = await eventRow('a');
    expect(String(event?.status)).toBe('errored');
    expect(String(event?.error)).toBe('boom');
    expect(await ledgerCounts()).toEqual({});
  });

  it('is idempotent', async () => {
    await seedPlan({ balance: 1_000 });
    await seedEvent('a', { creditsReserved: 300 });
    await billing.releaseReservation({ usageEventId: 'a' });
    expect(await billing.releaseReservation({ usageEventId: 'a' })).toBe(false);
    expect(Number((await accountRow())?.reserved)).toBe(0);
  });
});

// -- The sweep ---------------------------------------------------------------

describe('sweepStaleReservations', () => {
  it('releases stale holds and marks the events', async () => {
    // The fixture is production state: a hold taken on the row and stamped on
    // the event, then the process died before the turn came home.
    await seedPlan({ balance: 1_000, reserved: 200 });
    await seedEvent('stale', { createdAtMs: NOW - STALE_RESERVATION_MS - 1_000, creditsReserved: 200 });

    expect(await billing.sweepStaleReservations()).toBe(1);
    const event = await eventRow('stale');
    expect(String(event?.status)).toBe('errored');
    expect(String(event?.error)).toContain('swept');
    const row = await accountRow();
    expect(Number(row?.reserved)).toBe(0);
    expect(Number(row?.balance)).toBe(1_000);
  });

  it('leaves fresh and unstamped events alone', async () => {
    await seedPlan({ balance: 1_000, reserved: 200 });
    await seedEvent('fresh', { creditsReserved: 200 });
    await seedEvent('old-but-unstamped', { createdAtMs: NOW - STALE_RESERVATION_MS - 1_000 });

    expect(await billing.sweepStaleReservations()).toBe(0);
    expect(String((await eventRow('fresh'))?.status)).toBe('started');
    expect(Number((await accountRow())?.reserved)).toBe(200);
  });

  it('never releases an event twice', async () => {
    // A turn that settles a moment after being swept loses the race and must
    // not debit, because the sweep already gave the hold back.
    await seedPlan({ balance: 1_000, reserved: 200 });
    await seedEvent('stale', { createdAtMs: NOW - STALE_RESERVATION_MS - 1_000, creditsReserved: 200 });
    await billing.sweepStaleReservations();

    expect(await billing.settleCredits({ usageEventId: 'stale', actualCredits: 100 })).toEqual({ settled: false });
    expect(Number((await accountRow())?.balance)).toBe(1_000);
    expect(await ledgerCounts()).toEqual({});
  });
});

// -- Grants ------------------------------------------------------------------

describe('grantMonthly', () => {
  it('grants a first period', async () => {
    const result = await billing.grantMonthly({ accountId: ACCOUNT, plan: 'grand_maester', periodEndMs: FUTURE });

    expect(result).toEqual({ granted: true, balance: GRANT });
    const row = await accountRow();
    expect(String(row?.plan)).toBe('grand_maester');
    expect(String(row?.source)).toBe('subscription');
    expect(Number(row?.balance)).toBe(GRANT);
    expect(Number(row?.period_end_ms)).toBe(FUTURE);
    expect(await ledgerCounts()).toEqual({ MONTHLY_GRANT: 1 });
  });

  it('cannot be double-granted by a redelivered event', async () => {
    // The deterministic ledger id is the dedupe. RevenueCat retries, so the
    // second delivery of one renewal must be a no-op.
    await billing.grantMonthly({ accountId: ACCOUNT, plan: 'grand_maester', periodEndMs: FUTURE });
    const again = await billing.grantMonthly({ accountId: ACCOUNT, plan: 'grand_maester', periodEndMs: FUTURE });

    expect(again).toEqual({ granted: false, balance: GRANT });
    expect(await ledgerCounts()).toEqual({ MONTHLY_GRANT: 1 });
  });

  it('carries rollover under the cap', async () => {
    await seedPlan({ balance: 1_840 });
    const result = await billing.grantMonthly({ accountId: ACCOUNT, plan: 'grand_maester', periodEndMs: FUTURE });

    expect(result).toEqual({ granted: true, balance: 1_840 + GRANT });
    expect(await ledgerCounts()).toEqual({ MONTHLY_GRANT: 1 });
  });

  it('caps the rollover and writes the write-off', async () => {
    await seedPlan({ balance: 9_000 });
    const result = await billing.grantMonthly({ accountId: ACCOUNT, plan: 'grand_maester', periodEndMs: FUTURE });

    expect(result).toEqual({ granted: true, balance: CAP + GRANT });
    expect(await ledgerCounts()).toEqual({ MONTHLY_GRANT: 1, EXPIRATION: 1 });
    const expiration = await client.execute({
      sql: "SELECT credits, balance_after FROM credit_ledger WHERE account_id = ? AND type = 'EXPIRATION'",
      args: [ACCOUNT],
    });
    expect(Number(expiration.rows[0]?.credits)).toBe(-(9_000 - CAP));
    expect(Number(expiration.rows[0]?.balance_after)).toBe(CAP);
  });

  it('keeps a live reservation across a renewal', async () => {
    // The hold belongs to a turn that may still be in flight when the webhook
    // lands. Dropping it would let the reader start one more message than
    // they own.
    await seedPlan({ balance: 1_000, reserved: 400 });
    await billing.grantMonthly({ accountId: ACCOUNT, plan: 'grand_maester', periodEndMs: FUTURE });

    const row = await accountRow();
    expect(Number(row?.balance)).toBe(1_000 + GRANT);
    expect(Number(row?.reserved)).toBe(400);
  });

  it('deduplicates on the idempotency key when one is given', async () => {
    await billing.grantMonthly({
      accountId: ACCOUNT,
      plan: 'maester',
      periodEndMs: null,
      idempotencyKey: 'rc:reconcile',
    });
    const again = await billing.grantMonthly({
      accountId: ACCOUNT,
      plan: 'maester',
      periodEndMs: null,
      idempotencyKey: 'rc:reconcile',
    });
    expect(again.granted).toBe(false);
    expect(await ledgerCounts()).toEqual({ MONTHLY_GRANT: 1 });
  });
});

describe('clearPlan', () => {
  it('clears the plan and keeps the balance for the record', async () => {
    await seedPlan({ balance: 3_000 });
    await billing.clearPlan(ACCOUNT);

    const row = await accountRow();
    expect(row?.plan).toBeNull();
    expect(row?.source).toBeNull();
    expect(Number(row?.balance)).toBe(3_000);
    expect(await ledgerCounts()).toEqual({});
  });
});

// -- The repair --------------------------------------------------------------

describe('reconcileBalance', () => {
  it('rebuilds a drifted cache from the ledger without touching the ledger', async () => {
    await billing.grantMonthly({ accountId: ACCOUNT, plan: 'grand_maester', periodEndMs: FUTURE });
    // Whatever drifted it - a crash between the two writes of a grant - the
    // ledger is the truth and the cache is wrong.
    await client.execute({
      sql: 'UPDATE account_credits SET balance = ? WHERE account_id = ?',
      args: [9_000, ACCOUNT],
    });

    const result = await billing.reconcileBalance(ACCOUNT);
    expect(result).toEqual({ balance: GRANT, adjusted: GRANT - 9_000 });
    expect(Number((await accountRow())?.balance)).toBe(GRANT);
    // No correcting row: the credits did not move, and an adjustment would
    // change the very sum the balance was rebuilt from.
    expect(await ledgerCounts()).toEqual({ MONTHLY_GRANT: 1 });
  });

  it('is idempotent', async () => {
    await billing.grantMonthly({ accountId: ACCOUNT, plan: 'grand_maester', periodEndMs: FUTURE });
    await billing.reconcileBalance(ACCOUNT);
    expect(await billing.reconcileBalance(ACCOUNT)).toEqual({ balance: GRANT, adjusted: 0 });
  });

  it('creates a cache row when only the ledger exists', async () => {
    await billing.grantMonthly({ accountId: ACCOUNT, plan: 'grand_maester', periodEndMs: FUTURE });
    await client.execute({ sql: 'DELETE FROM account_credits WHERE account_id = ?', args: [ACCOUNT] });

    const result = await billing.reconcileBalance(ACCOUNT);
    expect(result).toEqual({ balance: GRANT, adjusted: GRANT });
    const row = await accountRow();
    expect(Number(row?.balance)).toBe(GRANT);
    expect(row?.plan).toBeNull();
    expect(Number(row?.reserved)).toBe(0);
  });

  it('answers zero for an account that never existed', async () => {
    expect(await billing.reconcileBalance(ACCOUNT)).toEqual({ balance: 0, adjusted: 0 });
    expect(await accountRow()).toBeUndefined();
  });
});

// -- Entitlement -------------------------------------------------------------

describe('readEntitlement', () => {
  it('answers from the cache row', async () => {
    await seedPlan({ balance: 1_200, reserved: 200 });
    expect(await billing.readEntitlement(ACCOUNT)).toEqual({
      plan: 'grand_maester',
      source: 'subscription',
      balance: 1_200,
      reserved: 200,
      available: 1_000,
      grant: GRANT,
      periodEndsAt: new Date(FUTURE).toISOString(),
    });
  });

  it('answers no plan for an unknown account', async () => {
    expect(await billing.readEntitlement(ACCOUNT)).toEqual({
      plan: null,
      source: null,
      balance: 0,
      reserved: 0,
      available: 0,
      grant: 0,
      periodEndsAt: null,
    });
  });

  it('answers an expired subscription as no plan, with the balance kept', async () => {
    await seedPlan({ plan: null, balance: 3_000, periodEndMs: NOW - 5_000 });
    const balance = await billing.readEntitlement(ACCOUNT);
    expect(balance.plan).toBeNull();
    expect(balance.balance).toBe(3_000);
    expect(balance.available).toBe(0);
  });

  it('reconciles a stale period against RevenueCat and grants what it learns', async () => {
    await seedPlan({ plan: 'maester', balance: 500, periodEndMs: NOW - 1_000 });
    const expiresDate = new Date(FUTURE).toISOString();

    const probed = createBillingService({
      client,
      now: () => nowMs,
      revenueCatApiKey: 'sk_test',
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          subscriber: {
            entitlements: { grand_maester: { expires_date: expiresDate } },
          },
        }),
      })) as unknown as typeof fetch,
    });
    const balance = await probed.readEntitlement(ACCOUNT);
    expect(balance.plan).toBe('grand_maester');
    expect(balance.balance).toBe(500 + GRANT);
    expect(balance.periodEndsAt).toBe(expiresDate);
    expect(await ledgerCounts()).toEqual({ MONTHLY_GRANT: 1 });
  });

  it('trusts the row when RevenueCat is not configured', async () => {
    // The key arrives with the founder's credentials. Until then the safety
    // net is inert, not fatal: a paying reader is never logged out because a
    // REST call could not be made.
    await seedPlan({ plan: 'maester', balance: 500, periodEndMs: NOW - 1_000 });
    let fetched = 0;
    const probed = createBillingService({
      client,
      now: () => nowMs,
      fetchImpl: (async () => {
        fetched += 1;
        throw new Error('should not be called');
      }) as unknown as typeof fetch,
    });
    const balance = await probed.readEntitlement(ACCOUNT);
    expect(balance.plan).toBe('maester');
    expect(fetched).toBe(0);
  });

  it('caches a plan-holding answer, and invalidates it when money moves', async () => {
    await seedPlan({ plan: 'maester', balance: 500, periodEndMs: NOW - 1_000 });
    const expiresDate = new Date(FUTURE).toISOString();
    let fetches = 0;
    const probed = createBillingService({
      client,
      now: () => nowMs,
      revenueCatApiKey: 'sk_test',
      cacheTtlMs: 60_000,
      fetchImpl: (async () => {
        fetches += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            subscriber: { entitlements: { maester: { expires_date: expiresDate } } },
          }),
        };
      }) as unknown as typeof fetch,
    });

    await probed.readEntitlement(ACCOUNT);
    await probed.readEntitlement(ACCOUNT);
    expect(fetches).toBe(1);

    // Past the TTL it looks again - and finds nothing new to learn.
    nowMs += 60_001;
    await probed.readEntitlement(ACCOUNT);
    expect(fetches).toBe(1);

    // Money moving through the same service drops the cache, and the next
    // read reflects it without another REST call (the row is fresh now).
    await seedEvent('a');
    await probed.reserveCredits({ accountId: ACCOUNT, usageEventId: 'a', credits: 10 });
    await probed.settleCredits({ usageEventId: 'a', actualCredits: 10 });
    const balance = await probed.readEntitlement(ACCOUNT);
    expect(fetches).toBe(1);
    expect(balance.balance).toBe(500 + CREDIT_PLANS.maester.monthlyCredits - 10);
  });
});

// -- Insiders ---------------------------------------------------------------

describe('insider invites', () => {
  it('mints a code a human can read out, and clamps the term to a year', async () => {
    const invite = await billing.issueInsiderInvite({ plan: 'maester', durationDays: 400 });
    expect(invite.durationDays).toBe(365);
    expect(invite.code).toMatch(/^[A-Z0-9]{5}(-[A-Z0-9]{5}){3}$/);
  });

  it('grants the first period and records the term', async () => {
    let granted: { expiresAtMs: number; entitlement: string } | null = null;
    const probed = createBillingService({
      client,
      now: () => nowMs,
      revenueCatApiKey: 'sk_test',
      fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST' && String(url).includes('/entitlements/')) {
          granted = {
            expiresAtMs: Date.parse(
              (JSON.parse(String(init.body)) as { expires_at: string }).expires_at,
            ),
            entitlement: String(url).split('/entitlements/')[1],
          };
          return { ok: true, status: 200, json: async () => ({}) };
        }
        throw new Error(`unexpected fetch: ${String(url)}`);
      }) as unknown as typeof fetch,
    });

    const { code } = await probed.issueInsiderInvite({ plan: 'maester', durationDays: 60 });
    const result = await probed.redeemInsiderInvite({ accountId: ACCOUNT, code });
    if (!result.redeemed) throw new Error('redemption should have succeeded');

    expect(result.balance.plan).toBe('maester');
    expect(result.balance.source).toBe('insider');
    expect(result.balance.balance).toBe(CREDIT_PLANS.maester.monthlyCredits);
    // The first period is bounded by the term: 60 days is shorter than the
    // usual 30-day rhythm doubled, so the period ends with the term's month
    // boundary and the sweep carries it from there.
    expect(result.balance.periodEndsAt).toBe(new Date(nowMs + 30 * 86_400_000).toISOString());

    const invite = await client.execute({
      sql: 'SELECT redeemed_by, expires_at_ms FROM insider_invites WHERE code = ?',
      args: [code],
    });
    expect(String(invite.rows[0]?.redeemed_by)).toBe(ACCOUNT);
    expect(Number(invite.rows[0]?.expires_at_ms)).toBe(nowMs + 60 * 86_400_000);

    // RevenueCat holds the entitlement for the whole term, not one period.
    expect(granted).toEqual({
      expiresAtMs: nowMs + 60 * 86_400_000,
      entitlement: CREDIT_PLANS.maester.entitlement,
    });
  });

  it('refuses a code twice, including concurrently', async () => {
    const { code } = await billing.issueInsiderInvite({ plan: 'maester', durationDays: 30 });
    await billing.redeemInsiderInvite({ accountId: ACCOUNT, code });
    expect(await billing.redeemInsiderInvite({ accountId: ACCOUNT, code })).toEqual({
      redeemed: false,
      reason: 'already_redeemed',
    });

    // Two devices racing one code: exactly one wins, the loser sees it taken.
    const { code: raced } = await billing.issueInsiderInvite({ plan: 'maester', durationDays: 30 });
    const results = await Promise.all([
      billing.redeemInsiderInvite({ accountId: 'account:reader-a', code: raced }),
      billing.redeemInsiderInvite({ accountId: 'account:reader-b', code: raced }),
    ]);
    expect(results.filter((r) => r.redeemed)).toHaveLength(1);
  });

  it('refuses an unknown code', async () => {
    expect(await billing.redeemInsiderInvite({ accountId: ACCOUNT, code: 'NOPE1-NOPE2-NOPE3-NOPE4' })).toEqual({
      redeemed: false,
      reason: 'unknown_code',
    });
  });

  it('refuses when a paid subscription is live, and leaves the code intact', async () => {
    await seedPlan({ plan: 'archmaester', balance: 5_000, periodEndMs: FUTURE });
    const { code } = await billing.issueInsiderInvite({ plan: 'maester', durationDays: 30 });

    expect(await billing.redeemInsiderInvite({ accountId: ACCOUNT, code })).toEqual({
      redeemed: false,
      reason: 'already_subscribed',
    });
    const invite = await client.execute({
      sql: 'SELECT redeemed_by FROM insider_invites WHERE code = ?',
      args: [code],
    });
    expect(invite.rows[0]?.redeemed_by).toBeNull();
    const row = await accountRow();
    expect(String(row?.plan)).toBe('archmaester');
  });

  it('refuses a lapsed subscription nothing, and lets the code take over', async () => {
    // A lapsed subscription leaves a row with no plan; a code is exactly the
    // remedy for that reader.
    await seedPlan({ plan: null, balance: 500, periodEndMs: NOW - 1_000 });
    const { code } = await billing.issueInsiderInvite({ plan: 'maester', durationDays: 30 });
    const result = await billing.redeemInsiderInvite({ accountId: ACCOUNT, code });
    if (!result.redeemed) throw new Error('redemption should have succeeded');
    expect(result.balance.plan).toBe('maester');
    // The leftover balance carries under the insider plan's cap.
    expect(result.balance.balance).toBe(500 + CREDIT_PLANS.maester.monthlyCredits);
  });

  describe('the regrant sweep', () => {
    it('extends a term one period at a time until it ends', async () => {
      const { code } = await billing.issueInsiderInvite({ plan: 'maester', durationDays: 70 });
      await billing.redeemInsiderInvite({ accountId: ACCOUNT, code });
      expect(await ledgerCounts()).toEqual({ MONTHLY_GRANT: 1 });

      // Day 31: the first period has ended, the term has not. The regrant
      // carries the leftover balance under the plan's rollover cap, so the
      // write-off row arrives with it - exactly what a renewal does.
      nowMs += 31 * 86_400_000;
      expect(await billing.sweepInsiderRegrants()).toBe(1);
      expect(await ledgerCounts()).toEqual({ EXPIRATION: 1, MONTHLY_GRANT: 2 });
      const maesterCap = CREDIT_PLANS.maester.rolloverCap;
      const midTerm = await billing.readEntitlement(ACCOUNT);
      expect(midTerm.plan).toBe('maester');
      expect(midTerm.balance).toBe(maesterCap + CREDIT_PLANS.maester.monthlyCredits);

      // The regrant is deduped, like every other grant.
      expect(await billing.sweepInsiderRegrants()).toBe(0);

      // Day 71: the term has run out. Nothing is left to grant, so the plan
      // ends here rather than on a second, later sweep.
      nowMs += 40 * 86_400_000;
      expect(await billing.sweepInsiderRegrants()).toBe(0);
      const after = await billing.readEntitlement(ACCOUNT);
      expect(after.plan).toBeNull();
      expect(after.balance).toBe(maesterCap + CREDIT_PLANS.maester.monthlyCredits);
    });

    it('ignores paid subscriptions and untouched terms', async () => {
      await seedPlan({ plan: 'grand_maester', periodEndMs: NOW - 1_000 });
      // A subscription row with no invite behind it: not the sweep's business.
      expect(await billing.sweepInsiderRegrants()).toBe(0);
      expect(String((await accountRow())?.plan)).toBe('grand_maester');
    });
  });
});

// -- The migration -----------------------------------------------------------

describe('usage_events migration', () => {
  it('renames device_id on an old database and leaves both halves working', async () => {
    // A database from before the credit work: the column still says
    // device_id, and the index says it too. This is the shape the live
    // deployment has on disk right now.
    const oldDir = mkdtempSync(join(tmpdir(), 'samwell-billing-migration-'));
    const oldClient = createClient({ url: `file:${join(oldDir, 'old.db')}` });
    try {
      await oldClient.execute(`CREATE TABLE usage_events (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'started',
        counts_toward_limit INTEGER NOT NULL DEFAULT 1,
        created_at_ms INTEGER NOT NULL,
        completed_at_ms INTEGER,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        cost_usd REAL,
        error TEXT
      )`);
      await oldClient.execute(
        'CREATE INDEX usage_events_device_time_idx ON usage_events (device_id, created_at_ms)',
      );
      await oldClient.execute({
        sql: `INSERT INTO usage_events (id, device_id, model_id, status, counts_toward_limit, created_at_ms)
              VALUES ('legacy-1', 'account:legacy', 'test/model', 'completed', 1, ?)`,
        args: [NOW],
      });

      await ensureBillingSchema(oldClient);
      // `initDb` adds this one itself, after its batch; mirrored here so the
      // fixture matches what production boots with.
      await oldClient.execute("ALTER TABLE usage_events ADD kind TEXT NOT NULL DEFAULT 'chat'");

      const columns = await oldClient.execute('PRAGMA table_info(usage_events)');
      const names = columns.rows.map((row) => String(row.name));
      expect(names).toContain('account_id');
      expect(names).not.toContain('device_id');
      expect(names).toContain('credits_reserved');
      expect(names).toContain('credits_charged');

      // The old index is gone, the renamed one in place.
      const indexes = await oldClient.execute('PRAGMA index_list(usage_events)');
      const indexNames = indexes.rows.map((row) => String(row.name));
      expect(indexNames).toContain('usage_events_account_time_idx');
      expect(indexNames).not.toContain('usage_events_device_time_idx');

      // The pre-existing rows survived the rename under the new name.
      const legacy = await oldClient.execute({
        sql: "SELECT COUNT(*) AS n FROM usage_events WHERE account_id = 'account:legacy'",
        args: [],
      });
      expect(Number(legacy.rows[0]?.n)).toBe(1);

      // A new event reserves on the renamed column exactly as production's
      // `reserveUsageEvent` writes it, and the credit ledger joins against it.
      await oldClient.execute({
        sql: `INSERT INTO usage_events (id, account_id, model_id, status, counts_toward_limit, created_at_ms)
              VALUES ('new-1', 'account:legacy', 'test/model', 'started', 1, ?)`,
        args: [NOW],
      });
      const migrated = createBillingService({ client: oldClient, now: () => nowMs });
      await oldClient.execute({
        sql: `INSERT INTO account_credits (account_id, plan, source, balance, reserved, updated_at_ms)
              VALUES ('account:legacy', 'grand_maester', 'subscription', 1000, 0, ?)`,
        args: [NOW],
      });
      expect(
        await migrated.reserveCredits({ accountId: 'account:legacy', usageEventId: 'new-1', credits: 100 }),
      ).toEqual({ allowed: true });
      const stamped = await oldClient.execute({
        sql: 'SELECT credits_reserved FROM usage_events WHERE id = ?',
        args: ['new-1'],
      });
      expect(Number(stamped.rows[0]?.credits_reserved)).toBe(100);
    } finally {
      oldClient.close();
      rmSync(oldDir, { recursive: true, force: true });
    }
  });
});
