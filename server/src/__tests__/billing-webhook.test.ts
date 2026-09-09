import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CREDIT_PLANS } from 'samwell-shared';

import { createBillingService, type BillingService } from '../billing.js';
import { routeRevenueCatEvent, createBillingWebhookRoutes } from '../billing-webhook.js';
import { USAGE_EVENTS_DDL, ensureBillingSchema } from '../db.js';

const NOW = 1_757_400_000_000;
const SUB = 'sub-reader-1';
const ACCOUNT = `account:${SUB}`;

let nowMs: number;
let client: Client;
let billing: BillingService;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'samwell-webhook-'));
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

async function accountRow(accountId = ACCOUNT): Promise<Record<string, unknown> | undefined> {
  const result = await client.execute({
    sql: 'SELECT plan, source, balance, period_end_ms FROM account_credits WHERE account_id = ?',
    args: [accountId],
  });
  return result.rows[0];
}

async function grantCount(accountId = ACCOUNT): Promise<number> {
  const result = await client.execute({
    sql: "SELECT COUNT(*) AS n FROM credit_ledger WHERE account_id = ? AND type = 'MONTHLY_GRANT'",
    args: [accountId],
  });
  return Number(result.rows[0]?.n ?? 0);
}

function event(fields: Record<string, unknown>): Record<string, unknown> {
  return { id: 'evt-1', app_user_id: SUB, ...fields };
}

describe('routeRevenueCatEvent', () => {
  it('grants the plan an INITIAL_PURCHASE names', async () => {
    const outcome = await routeRevenueCatEvent(
      event({
        type: 'INITIAL_PURCHASE',
        entitlement_id: 'grand_maester',
        expiration_at_ms: NOW + 30 * 86_400_000,
      }),
      billing,
    );

    expect(outcome.action).toBe('granted');
    const row = await accountRow();
    expect(String(row?.plan)).toBe('grand_maester');
    expect(Number(row?.balance)).toBe(CREDIT_PLANS.grand_maester.monthlyCredits);
    expect(await grantCount()).toBe(1);
  });

  it('does not double-grant a redelivered renewal', async () => {
    const renewal = event({
      type: 'RENEWAL',
      entitlement_id: 'maester',
      expiration_at_ms: NOW + 30 * 86_400_000,
    });
    await routeRevenueCatEvent(renewal, billing);
    await routeRevenueCatEvent(renewal, billing);

    expect(await grantCount()).toBe(1);
    expect(Number((await accountRow())?.balance)).toBe(CREDIT_PLANS.maester.monthlyCredits);
  });

  it('grants a renewal for a new period', async () => {
    await routeRevenueCatEvent(
      event({ type: 'INITIAL_PURCHASE', entitlement_id: 'maester', expiration_at_ms: NOW + 1 }),
      billing,
    );
    const outcome = await routeRevenueCatEvent(
      event({
        type: 'RENEWAL',
        entitlement_id: 'maester',
        expiration_at_ms: NOW + 30 * 86_400_000,
      }),
      billing,
    );

    expect(outcome.action).toBe('granted');
    expect(await grantCount()).toBe(2);
  });

  it('maps each entitlement event type to the same grant path', async () => {
    for (const type of ['PRODUCT_CHANGE', 'UNCANCELLATION', 'TEMPORARY_ENTITLEMENT_GRANT']) {
      const fresh = mkdtempSync(join(tmpdir(), 'samwell-webhook-type-'));
      const typeClient = createClient({ url: `file:${join(fresh, 'test.db')}` });
      try {
        await typeClient.execute(USAGE_EVENTS_DDL);
        await ensureBillingSchema(typeClient);
        const typeBilling = createBillingService({ client: typeClient, now: () => nowMs });
        const outcome = await routeRevenueCatEvent(
          event({ type, entitlement_id: 'maester', expiration_at_ms: NOW + 86_400_000 }),
          typeBilling,
        );
        expect(outcome.action).toBe('granted');
        expect(String((await typeClient.execute({
          sql: 'SELECT plan FROM account_credits WHERE account_id = ?',
          args: [ACCOUNT],
        })).rows[0]?.plan)).toBe('maester');
      } finally {
        typeClient.close();
        rmSync(fresh, { recursive: true, force: true });
      }
    }
  });

  it('clears the plan on expiration and on a billing issue, keeping the balance', async () => {
    await routeRevenueCatEvent(
      event({ type: 'INITIAL_PURCHASE', entitlement_id: 'maester', expiration_at_ms: NOW + 1 }),
      billing,
    );
    for (const type of ['EXPIRATION', 'BILLING_ISSUE']) {
      const outcome = await routeRevenueCatEvent(event({ type }), billing);
      expect(outcome.action).toBe('cleared');
      const row = await accountRow();
      expect(row?.plan).toBeNull();
      expect(Number(row?.balance)).toBe(CREDIT_PLANS.maester.monthlyCredits);
    }
  });

  it('moves a transfer to the receiving account', async () => {
    const outcome = await routeRevenueCatEvent(
      event({
        type: 'TRANSFER',
        transferred_from_app_user_ids: ['anon-old'],
        transferred_to_app_user_ids: [SUB],
        entitlement_id: 'grand_maester',
        expiration_at_ms: NOW + 30 * 86_400_000,
      }),
      billing,
    );

    expect(outcome.action).toBe('granted');
    expect(String((await accountRow())?.plan)).toBe('grand_maester');
  });

  it('answers 200-equivalent outcomes for what it does not know', async () => {
    expect(await routeRevenueCatEvent(event({ type: 'TEST' }), billing)).toEqual({
      action: 'ignored',
      note: 'test',
    });
    expect(
      await routeRevenueCatEvent(event({ type: 'SOMETHING_NEW' }), billing).then((o) => o.action),
    ).toBe('ignored');
    expect(
      await routeRevenueCatEvent(
        event({ type: 'RENEWAL', entitlement_id: 'some_other_entitlement' }),
        billing,
      ),
    ).toMatchObject({ action: 'ignored' });
    expect(
      await routeRevenueCatEvent({ type: 'RENEWAL', entitlement_id: 'maester' }, billing),
    ).toMatchObject({ action: 'ignored', note: 'no app_user_id' });

    // None of the above touched money.
    expect(await grantCount()).toBe(0);
  });
});

describe('the webhook endpoint', () => {
  it('refuses a wrong or missing secret', async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = 'whsec_test';
    try {
      const routes = createBillingWebhookRoutes(billing);
      const missing = await routes.request('/revenuecat/webhook', {
        method: 'POST',
        body: JSON.stringify({ event: { type: 'TEST' } }),
      });
      expect(missing.status).toBe(401);

      const wrong = await routes.request('/revenuecat/webhook', {
        method: 'POST',
        headers: { Authorization: 'Bearer whsec_wrong' },
        body: JSON.stringify({ event: { type: 'TEST' } }),
      });
      expect(wrong.status).toBe(401);
    } finally {
      delete process.env.REVENUECAT_WEBHOOK_SECRET;
    }
  });

  it('answers an authenticated test event with 200', async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = 'whsec_test';
    try {
      const routes = createBillingWebhookRoutes(billing);
      const response = await routes.request('/revenuecat/webhook', {
        method: 'POST',
        headers: { Authorization: 'Bearer whsec_test' },
        body: JSON.stringify({ event: { type: 'TEST', id: 'evt-test' } }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
    } finally {
      delete process.env.REVENUECAT_WEBHOOK_SECRET;
    }
  });

  it('answers an unconfigured webhook with 500, not a redelivery loop', async () => {
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
    const routes = createBillingWebhookRoutes(billing);
    const response = await routes.request('/revenuecat/webhook', {
      method: 'POST',
      headers: { Authorization: 'Bearer anything' },
      body: JSON.stringify({ event: { type: 'TEST' } }),
    });
    expect(response.status).toBe(500);
  });
});
