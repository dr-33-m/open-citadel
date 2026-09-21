import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CREDIT_PLANS } from 'samwell-shared';

import { createBillingService, type BillingService } from '../billing.js';
import { ensureBillingSchema, USAGE_EVENTS_DDL } from '../db.js';

/*
 * A device that bought a plan without making an account, and what happens when
 * it later makes one. Against a real SQLite file for the same reason the
 * billing suite is: the thing under test is what survives a crash and what one
 * statement sees of another.
 */

const NOW = 1_757_400_000_000;
const DAY_MS = 86_400_000;
const FUTURE = NOW + 30 * DAY_MS;
const GUEST = 'guest:0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55';
const ACCOUNT = 'account:reader-sub';
const GRANT = CREDIT_PLANS.grand_maester.monthlyCredits;

let nowMs: number;
let client: Client;
let billing: BillingService;
let dir: string;
let fetchCalls: string[];

/** A RevenueCat customer response with one active entitlement. */
function subscriberWith(entitlement: string | null): Response {
  return new Response(
    JSON.stringify({
      subscriber: {
        entitlements: entitlement
          ? { [entitlement]: { expires_date: new Date(FUTURE).toISOString() } }
          : {},
      },
    }),
    { status: 200 },
  );
}

/** Answers for the subscriber ids named, and an empty customer for the rest. */
function revenueCatServing(holders: Record<string, string>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const subject = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));
    fetchCalls.push(subject);
    return subscriberWith(holders[subject] ?? null);
  }) as unknown as typeof fetch;
}

async function makeGuest(guestId = GUEST): Promise<void> {
  await client.execute({
    sql: `INSERT INTO guest_identities (guest_id, secret_sha256, created_at_ms)
          VALUES (?, ?, ?)`,
    args: [guestId, 'x'.repeat(64), NOW],
  });
}

function build(fetchImpl?: typeof fetch): BillingService {
  return createBillingService({
    client,
    now: () => nowMs,
    revenueCatApiKey: 'test-key',
    fetchImpl,
  });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'samwell-guest-'));
  client = createClient({ url: `file:${join(dir, 'test.db')}` });
  await client.execute(USAGE_EVENTS_DDL);
  await ensureBillingSchema(client);
  nowMs = NOW;
  fetchCalls = [];
  billing = build();
});

afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('linkGuest', () => {
  it('carries the plan, the balance and the history onto the account', async () => {
    await makeGuest();
    await billing.grantMonthly({ accountId: GUEST, plan: 'grand_maester', periodEndMs: FUTURE });

    const result = await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });

    expect(result).toMatchObject({ linked: true });
    const balance = await billing.readEntitlement(ACCOUNT);
    expect(balance.plan).toBe('grand_maester');
    expect(balance.available).toBe(GRANT);

    // The grant row follows them, so their own history is not orphaned under
    // an identity they can no longer authenticate as.
    const ledger = await billing.readLedger(ACCOUNT, 10);
    expect(ledger).toHaveLength(1);
    expect(await billing.readLedger(GUEST, 10)).toHaveLength(0);
  });

  it('leaves nothing behind on the guest id', async () => {
    await makeGuest();
    await billing.grantMonthly({ accountId: GUEST, plan: 'maester', periodEndMs: FUTURE });

    await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });

    // Which is also what makes a still-valid guest token harmless: there is
    // nothing left under that id to spend.
    expect(await billing.peekCredits(GUEST)).toBeNull();
  });

  it('answers a repeat of the same pair as the success it is', async () => {
    /*
     * The app retries a link whose response it never saw, which is the whole
     * reason this matters. Without it the second attempt finds the account
     * holding the plan it was itself given a moment ago, reads that as the
     * account having one of its own, and tells somebody who paid once that
     * they paid twice.
     */
    await makeGuest();
    await billing.grantMonthly({ accountId: GUEST, plan: 'grand_maester', periodEndMs: FUTURE });
    await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });

    const again = await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });

    expect(again).toMatchObject({ linked: true });
    const balance = await billing.readEntitlement(ACCOUNT);
    expect(balance.plan).toBe('grand_maester');
    // Not doubled. The repeat moved nothing, it only said so.
    expect(balance.available).toBe(GRANT);
  });

  it('still refuses a DIFFERENT account that already holds a plan', async () => {
    await makeGuest();
    await billing.grantMonthly({ accountId: GUEST, plan: 'maester', periodEndMs: FUTURE });
    await billing.grantMonthly({ accountId: ACCOUNT, plan: 'archmaester', periodEndMs: FUTURE });

    expect(await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT })).toMatchObject({
      linked: false,
      reason: 'account_has_plan',
    });
  });

  it('does not delete the account row for a guest with nothing to move yet', async () => {
    // A purchase whose webhook has not landed: the guest has no credit row.
    // The account's row must survive, and the link is still recorded for the
    // webhook to resolve through when it arrives.
    const LEFTOVER = 75;
    await makeGuest();
    await client.execute({
      sql: `INSERT INTO account_credits (account_id, plan, source, balance, reserved, updated_at_ms)
            VALUES (?, NULL, NULL, ?, 0, ?)`,
      args: [ACCOUNT, LEFTOVER, NOW],
    });

    expect(await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT })).toMatchObject({
      linked: true,
    });
    // `balance`, not `available`: with no plan the display figure is zero by
    // design, and what matters here is that the credits are still on the row.
    expect((await billing.readEntitlement(ACCOUNT)).balance).toBe(LEFTOVER);
  });

  it('records the link, so a later renewal can be resolved', async () => {
    await makeGuest();
    await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });

    const row = await client.execute({
      sql: 'SELECT linked_account_id FROM guest_identities WHERE guest_id = ?',
      args: [GUEST],
    });
    expect(row.rows[0]?.linked_account_id).toBe(ACCOUNT);
  });

  it('refuses an account that already holds a plan, and takes nothing from either', async () => {
    await makeGuest();
    await billing.grantMonthly({ accountId: GUEST, plan: 'maester', periodEndMs: FUTURE });
    await billing.grantMonthly({ accountId: ACCOUNT, plan: 'archmaester', periodEndMs: FUTURE });

    const result = await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });

    expect(result).toEqual({ linked: false, reason: 'account_has_plan' });
    expect((await billing.readEntitlement(ACCOUNT)).plan).toBe('archmaester');
    expect((await billing.readEntitlement(GUEST)).plan).toBe('maester');
  });

  it('links an account whose own plan has ended, and keeps its leftover credits', async () => {
    /*
     * This used to be refused, and this test used to insist on it: deleting
     * the account's row to make room would have thrown away credits they
     * paid for. The link carries them now instead, so the reason is gone -
     * and refusing had a cost of its own. A reader who subscribed once and
     * stopped was told their account "already has its own plan" when it had
     * none, and the plan they had just bought stayed stranded on the phone.
     */
    await makeGuest();
    await billing.grantMonthly({ accountId: GUEST, plan: 'grand_maester', periodEndMs: FUTURE });
    await billing.grantMonthly({ accountId: ACCOUNT, plan: 'maester', periodEndMs: FUTURE });
    await billing.clearPlan(ACCOUNT);
    const leftover = (await billing.readEntitlement(ACCOUNT)).balance;
    expect(leftover).toBeGreaterThan(0);

    const result = await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });

    expect(result).toMatchObject({ linked: true });
    const balance = await billing.readEntitlement(ACCOUNT);
    expect(balance.plan).toBe('grand_maester');
    // Both: the plan they bought, and the credits that were already theirs.
    expect(balance.balance).toBe(GRANT + leftover);

    // And the ledger says where the extra came from, so it still adds up.
    const ledger = await billing.readLedger(ACCOUNT, 10);
    expect(ledger.some((row) => row.type === 'LINK_CARRY' && row.credits === leftover)).toBe(
      true,
    );
  });

  it('links onto an account that has only ever been signed into', async () => {
    await makeGuest();
    await billing.grantMonthly({ accountId: GUEST, plan: 'maester', periodEndMs: FUTURE });
    // No plan, no credits: what an account looks like before it buys anything.
    await billing.grantMonthly({ accountId: ACCOUNT, plan: 'maester', periodEndMs: FUTURE });
    await client.execute({
      sql: 'UPDATE account_credits SET plan = NULL, balance = 0 WHERE account_id = ?',
      args: [ACCOUNT],
    });

    const result = await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });
    expect(result).toMatchObject({ linked: true });
    expect((await billing.readEntitlement(ACCOUNT)).plan).toBe('maester');
  });
});

describe('syncEntitlement after a link', () => {
  /*
   * The dangerous one. RevenueCat does not move a subscription off an
   * identified id, so after a link the ledger says `account:<sub>` while
   * RevenueCat still knows it as `guest:<uuid>`. A reconcile that asked only
   * about the subject would be told "no entitlements" and read that as
   * cancelled.
   */
  it('asks about the linked guest id, and keeps the plan alive', async () => {
    await makeGuest();
    await billing.grantMonthly({ accountId: GUEST, plan: 'grand_maester', periodEndMs: FUTURE });
    await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });

    // RevenueCat holds it under the guest id and knows nothing of the subject.
    const service = build(revenueCatServing({ [GUEST]: 'grand_maester' }));
    const result = await service.syncEntitlement(ACCOUNT);

    expect(fetchCalls).toContain(GUEST);
    expect(result).toEqual({ status: 'active', plan: 'grand_maester' });
    expect((await service.readEntitlement(ACCOUNT)).plan).toBe('grand_maester');
  });

  it('still clears a plan that has genuinely ended everywhere', async () => {
    await makeGuest();
    await billing.grantMonthly({ accountId: GUEST, plan: 'maester', periodEndMs: FUTURE });
    await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });

    const service = build(revenueCatServing({}));
    const result = await service.syncEntitlement(ACCOUNT);

    expect(result).toEqual({ status: 'inactive' });
    expect((await service.readEntitlement(ACCOUNT)).plan).toBeNull();
  });

  it('treats one unanswered subject as unknown rather than cancelled', async () => {
    await makeGuest();
    await billing.grantMonthly({ accountId: GUEST, plan: 'maester', periodEndMs: FUTURE });
    await billing.linkGuest({ guestId: GUEST, accountId: ACCOUNT });

    const failing = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const subject = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));
      // The subject answers empty; the id that actually holds it fails.
      return subject === GUEST ? new Response('nope', { status: 500 }) : subscriberWith(null);
    }) as unknown as typeof fetch;

    const service = build(failing);
    expect(await service.syncEntitlement(ACCOUNT)).toEqual({ status: 'unavailable' });
    // The plan is left exactly as it was, rather than cleared on a blip.
    expect((await service.readEntitlement(ACCOUNT)).plan).toBe('maester');
  });

  it('asks only about the guest id for an unlinked guest', async () => {
    await makeGuest();
    const service = build(revenueCatServing({ [GUEST]: 'maester' }));

    expect(await service.syncEntitlement(GUEST)).toEqual({ status: 'active', plan: 'maester' });
    expect(fetchCalls).toEqual([GUEST]);
  });
});
