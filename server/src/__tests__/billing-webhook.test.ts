import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CREDIT_PLANS } from 'samwell-shared';

import { createBillingWebhookRoutes, routeRevenueCatEvent } from '../billing-webhook.js';
import { createBillingService, type BillingService } from '../billing.js';
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
    // Not TEMPORARY_ENTITLEMENT_GRANT: its payload names no entitlement, so it
    // is read from RevenueCat instead. See 'an outage grant'.
    for (const type of ['PRODUCT_CHANGE', 'UNCANCELLATION']) {
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

  it('preserves access on cancellation and billing issue when RevenueCat is unavailable', async () => {
    await routeRevenueCatEvent(
      event({ type: 'INITIAL_PURCHASE', entitlement_id: 'maester', expiration_at_ms: NOW + 1 }),
      billing,
    );
    for (const type of ['CANCELLATION', 'BILLING_ISSUE']) {
      const outcome = await routeRevenueCatEvent(event({ type }), billing);
      expect(outcome.action).toBe('ignored');
      const row = await accountRow();
      expect(String(row?.plan)).toBe('maester');
      expect(Number(row?.balance)).toBe(CREDIT_PLANS.maester.monthlyCredits);
    }
  });

  it('clears an account on billing issue only when RevenueCat confirms it is inactive', async () => {
    await billing.grantMonthly({
      accountId: ACCOUNT,
      plan: 'maester',
      periodEndMs: NOW + 30 * 86_400_000,
    });
    const reconciled = createBillingService({
      client,
      now: () => nowMs,
      revenueCatApiKey: 'sk_test',
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ subscriber: { entitlements: {} } }),
      })) as unknown as typeof fetch,
    });

    const outcome = await routeRevenueCatEvent(event({ type: 'BILLING_ISSUE' }), reconciled);

    expect(outcome.action).toBe('cleared');
    expect((await accountRow())?.plan).toBeNull();
  });

  it('preserves access when cancellation reconciliation returns no active entitlement', async () => {
    await billing.grantMonthly({
      accountId: ACCOUNT,
      plan: 'maester',
      periodEndMs: NOW + 30 * 86_400_000,
    });
    const reconciled = createBillingService({
      client,
      now: () => nowMs,
      revenueCatApiKey: 'sk_test',
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ subscriber: { entitlements: {} } }),
      })) as unknown as typeof fetch,
    });

    const outcome = await routeRevenueCatEvent(event({ type: 'CANCELLATION' }), reconciled);

    expect(outcome.action).toBe('ignored');
    expect(String((await accountRow())?.plan)).toBe('maester');
  });

  it('does not clear a replacement plan when an older entitlement expires', async () => {
    await billing.grantMonthly({
      accountId: ACCOUNT,
      plan: 'grand_maester',
      periodEndMs: NOW + 30 * 86_400_000,
    });
    const expiresDate = new Date(NOW + 30 * 86_400_000).toISOString();
    const reconciled = createBillingService({
      client,
      now: () => nowMs,
      revenueCatApiKey: 'sk_test',
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          subscriber: {
            entitlements: {
              maester: { expires_date: new Date(NOW - 1).toISOString() },
              archmaester: { expires_date: expiresDate },
            },
          },
        }),
      })) as unknown as typeof fetch,
    });

    const outcome = await routeRevenueCatEvent(
      event({ type: 'EXPIRATION', entitlement_id: 'maester' }),
      reconciled,
    );

    expect(outcome).toMatchObject({ action: 'reconciled' });
    expect(String((await accountRow())?.plan)).toBe('archmaester');
  });

  it('clears only when expiration reconciliation confirms no active entitlement', async () => {
    await billing.grantMonthly({
      accountId: ACCOUNT,
      plan: 'maester',
      periodEndMs: NOW + 1,
    });
    const reconciled = createBillingService({
      client,
      now: () => nowMs,
      revenueCatApiKey: 'sk_test',
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ subscriber: { entitlements: {} } }),
      })) as unknown as typeof fetch,
    });

    const outcome = await routeRevenueCatEvent(event({ type: 'EXPIRATION' }), reconciled);

    expect(outcome.action).toBe('cleared');
    expect((await accountRow())?.plan).toBeNull();
  });

  it('moves a granted plan with its subscription, reading the fields RevenueCat sends', async () => {
    const OTHER = 'account:sub-reader-2';
    const periodEndMs = NOW + 30 * 86_400_000;
    await billing.grantMonthly({ accountId: ACCOUNT, plan: 'grand_maester', periodEndMs });

    // The shape RevenueCat documents: ids only, no entitlement, no expiry.
    const outcome = await routeRevenueCatEvent(
      {
        id: 'evt-transfer',
        type: 'TRANSFER',
        transferred_from: [SUB],
        transferred_to: ['sub-reader-2'],
      },
      billing,
    );

    expect(outcome.action).toBe('granted');
    expect(await grantCount(OTHER)).toBe(0);
    expect(String((await accountRow(OTHER))?.plan)).toBe('grand_maester');
    expect(Number((await accountRow(OTHER))?.balance)).toBe(
      CREDIT_PLANS.grand_maester.monthlyCredits,
    );
    expect((await accountRow())?.plan).toBeNull();
  });

  describe('the anonymous ids RevenueCat lists beside the real ones', () => {
    const GUEST = 'guest:0f0e4c1a-6c8e-4f7a-9d1b-2a3b4c5d6e7f';

    async function ghostRows(): Promise<number> {
      const result = await client.execute(
        "SELECT COUNT(*) AS n FROM account_credits WHERE account_id LIKE 'account:$RCAnonymousID:%'",
      );
      return Number(result.rows[0]?.n);
    }

    async function linkGuestTo(accountId: string): Promise<void> {
      await client.execute({
        sql: `INSERT INTO guest_identities (guest_id, secret_sha256, created_at_ms, linked_account_id, linked_at_ms)
              VALUES (?, 'x', ?, ?, ?)`,
        args: [GUEST, NOW, accountId, NOW],
      });
    }

    it('moves a plan to the receiving customer, not onto its anonymous alias', async () => {
      const OTHER = 'account:sub-reader-2';
      await billing.grantMonthly({
        accountId: ACCOUNT,
        plan: 'grand_maester',
        periodEndMs: NOW + 30 * 86_400_000,
      });

      await routeRevenueCatEvent(
        {
          id: 'evt-transfer',
          type: 'TRANSFER',
          transferred_from: [SUB, '$RCAnonymousID:aaa'],
          transferred_to: ['sub-reader-2', '$RCAnonymousID:bbb'],
        },
        billing,
      );

      expect(String((await accountRow(OTHER))?.plan)).toBe('grand_maester');
      expect(Number((await accountRow(OTHER))?.balance)).toBe(
        CREDIT_PLANS.grand_maester.monthlyCredits,
      );
      expect(await ghostRows()).toBe(0);
    });

    it('leaves a plan where it is when it moves from a linked guest to that account', async () => {
      // The device pass: bought as a guest, signed in, linked, and the link's
      // restore moved the Play subscription onto the account in RevenueCat.
      await linkGuestTo(ACCOUNT);
      await billing.grantMonthly({
        accountId: ACCOUNT,
        plan: 'grand_maester',
        periodEndMs: NOW + 30 * 86_400_000,
      });

      const outcome = await routeRevenueCatEvent(
        {
          id: 'evt-transfer',
          type: 'TRANSFER',
          transferred_from: [GUEST, '$RCAnonymousID:aaa'],
          transferred_to: [SUB, '$RCAnonymousID:bbb'],
        },
        billing,
      );

      expect(outcome.action).toBe('reconciled');
      expect(String((await accountRow())?.plan)).toBe('grand_maester');
      expect(Number((await accountRow())?.balance)).toBe(
        CREDIT_PLANS.grand_maester.monthlyCredits,
      );
      expect(await ghostRows()).toBe(0);
    });

    it('credits a renewal to the account when app_user_id is the anonymous alias', async () => {
      await routeRevenueCatEvent(
        event({
          type: 'RENEWAL',
          app_user_id: '$RCAnonymousID:aaa',
          aliases: ['$RCAnonymousID:aaa', SUB],
          entitlement_ids: ['grand_maester'],
          expiration_at_ms: NOW + 30 * 86_400_000,
        }),
        billing,
      );

      expect(String((await accountRow())?.plan)).toBe('grand_maester');
      expect(await ghostRows()).toBe(0);
    });

    it('credits a renewal under a linked guest to its account', async () => {
      await linkGuestTo(ACCOUNT);

      await routeRevenueCatEvent(
        event({
          type: 'RENEWAL',
          app_user_id: GUEST,
          entitlement_ids: ['grand_maester'],
          expiration_at_ms: NOW + 30 * 86_400_000,
        }),
        billing,
      );

      expect(String((await accountRow())?.plan)).toBe('grand_maester');
      expect(await accountRow(GUEST)).toBeUndefined();
    });

    it('ignores an event that names nobody but an anonymous id', async () => {
      const outcome = await routeRevenueCatEvent(
        event({
          type: 'INITIAL_PURCHASE',
          app_user_id: '$RCAnonymousID:aaa',
          entitlement_ids: ['grand_maester'],
          expiration_at_ms: NOW + 30 * 86_400_000,
        }),
        billing,
      );

      expect(outcome.action).toBe('ignored');
      expect(await ghostRows()).toBe(0);
    });
  });

  it('reconciles the receiver of a transfer from an id it never granted', async () => {
    const reconciled = createBillingService({
      client,
      now: () => nowMs,
      revenueCatApiKey: 'sk_test',
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          subscriber: {
            entitlements: {
              grand_maester: { expires_date: new Date(NOW + 30 * 86_400_000).toISOString() },
            },
          },
        }),
      })) as unknown as typeof fetch,
    });

    const outcome = await routeRevenueCatEvent(
      { id: 'evt-transfer', type: 'TRANSFER', transferred_from: ['anon-old'], transferred_to: [SUB] },
      reconciled,
    );

    expect(outcome.action).toBe('reconciled');
    expect(String((await accountRow())?.plan)).toBe('grand_maester');
  });

  describe('one period reported two ways', () => {
    // A Play expiry, milliseconds and all, and the REST API's view of the
    // same instant, which stops at the second.
    const playExpiryMs = NOW + 30 * 86_400_000 + 123;
    const restExpiry = new Date(playExpiryMs).toISOString().replace(/\.\d{3}Z$/, 'Z');

    function reconcilingWith(expiresDate: string): BillingService {
      return createBillingService({
        client,
        now: () => nowMs,
        revenueCatApiKey: 'sk_test',
        fetchImpl: (async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            subscriber: { entitlements: { maester: { expires_date: expiresDate } } },
          }),
        })) as unknown as typeof fetch,
      });
    }

    it('does not grant again when a cancellation reconciles a Play period', async () => {
      const reconciled = reconcilingWith(restExpiry);
      await routeRevenueCatEvent(
        event({ type: 'INITIAL_PURCHASE', entitlement_ids: ['maester'], expiration_at_ms: playExpiryMs }),
        reconciled,
      );

      await routeRevenueCatEvent(event({ id: 'evt-2', type: 'CANCELLATION' }), reconciled);

      expect(await grantCount()).toBe(1);
    });

    it('does not grant again when a late renewal follows the reconcile that saw it first', async () => {
      const reconciled = reconcilingWith(restExpiry);
      await reconciled.grantMonthly({ accountId: ACCOUNT, plan: 'maester', periodEndMs: NOW + 1_000 });
      nowMs = NOW + 5_000;
      await reconciled.readEntitlement(ACCOUNT);

      await routeRevenueCatEvent(
        event({ id: 'evt-2', type: 'RENEWAL', entitlement_ids: ['maester'], expiration_at_ms: playExpiryMs }),
        reconciled,
      );

      expect(await grantCount()).toBe(2);
    });
  });

  describe('an outage grant', () => {
    const HOUR = 3_600_000;
    const GRANT = CREDIT_PLANS.maester.monthlyCredits;
    const REAL_END = NOW + 30 * 86_400_000;
    // What RevenueCat answers, changed as the story moves on.
    let entitlement: { purchase_date: string; expires_date: string } | null;

    function outageBilling(): BillingService {
      return createBillingService({
        client,
        now: () => nowMs,
        revenueCatApiKey: 'sk_test',
        fetchImpl: (async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            subscriber: { entitlements: entitlement ? { maester: entitlement } : {} },
          }),
        })) as unknown as typeof fetch,
      });
    }

    function answer(purchasedAtMs: number, expiresAtMs: number) {
      entitlement = {
        purchase_date: new Date(purchasedAtMs).toISOString(),
        expires_date: new Date(expiresAtMs).toISOString(),
      };
    }

    async function balance(): Promise<number> {
      return Number((await accountRow())?.balance);
    }

    beforeEach(() => {
      entitlement = null;
    });

    it('grants the month at once, and the purchase that follows confirms it', async () => {
      const outage = outageBilling();
      answer(NOW, NOW + 24 * HOUR);

      // The event itself names no entitlement; RevenueCat is asked instead.
      const first = await routeRevenueCatEvent(
        { id: 'evt-outage', type: 'TEMPORARY_ENTITLEMENT_GRANT', app_user_id: SUB },
        outage,
      );
      expect(first.action).toBe('reconciled');
      expect(await balance()).toBe(GRANT);

      answer(NOW, REAL_END);
      await routeRevenueCatEvent(
        event({ type: 'INITIAL_PURCHASE', entitlement_ids: ['maester'], expiration_at_ms: REAL_END }),
        outage,
      );

      expect(await grantCount()).toBe(1);
      expect(await balance()).toBe(GRANT);
      expect(Number((await accountRow())?.period_end_ms)).toBe(REAL_END);
    });

    it('is confirmed by a lookup too, when the webhook is late', async () => {
      const outage = outageBilling();
      answer(NOW, NOW + 24 * HOUR);
      await outage.readEntitlement(ACCOUNT);

      nowMs = NOW + 25 * HOUR;
      answer(NOW, REAL_END);
      const read = await outage.readEntitlement(ACCOUNT);

      expect(read.plan).toBe('maester');
      expect(await grantCount()).toBe(1);
      expect(await balance()).toBe(GRANT);
    });

    it('gives back what is left when the store does not confirm it, once', async () => {
      const outage = outageBilling();
      // Credits from an earlier plan, which are theirs whatever happens.
      await client.execute({
        sql: `INSERT INTO account_credits (account_id, plan, source, balance, reserved, updated_at_ms)
              VALUES (?, NULL, NULL, 500, 0, ?)`,
        args: [ACCOUNT, NOW],
      });
      answer(NOW, NOW + 24 * HOUR);
      await outage.readEntitlement(ACCOUNT);
      await client.execute({
        sql: 'UPDATE account_credits SET balance = balance - 100 WHERE account_id = ?',
        args: [ACCOUNT],
      });

      entitlement = null;
      await routeRevenueCatEvent(event({ type: 'EXPIRATION' }), outage);
      await routeRevenueCatEvent(event({ type: 'EXPIRATION' }), outage);

      expect((await accountRow())?.plan).toBeNull();
      // As if the outage grant had never happened: the whole grant goes, so
      // the 100 they spent comes out of the 500 that were theirs.
      expect(await balance()).toBe(400);
    });

    it('is not mistaken for a real month looked up near its end', async () => {
      const outage = outageBilling();
      answer(NOW - 29 * 86_400_000, NOW + 12 * HOUR);
      await outage.readEntitlement(ACCOUNT);

      await routeRevenueCatEvent(
        event({ type: 'RENEWAL', entitlement_ids: ['maester'], expiration_at_ms: REAL_END }),
        outage,
      );

      expect(await grantCount()).toBe(2);
    });
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
    ).toMatchObject({ action: 'ignored', note: 'no ledger for this customer' });

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
