/**
 * The RevenueCat webhook: the store's word about a subscription, turned into
 * ledger rows.
 *
 * Two things make this endpoint unglamorous and load-bearing at once. It is
 * the ONLY thing that grants a paid plan without a reader asking (the app
 * polls `/billing/me` after a purchase; the webhook is what makes the answer
 * change), and it is called by a retrying stranger - RevenueCat redelivers
 * anything that is not answered 200, so every path here is idempotent and
 * every unknown is answered 200 and logged rather than erroring into an
 * infinite retry loop.
 *
 * The dispatcher is separate from the HTTP wrapper so the event-to-action
 * mapping can be tested without a server: `routeRevenueCatEvent` knows
 * nothing about headers or responses, only about what each event type means
 * for an account.
 */
import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { planForEntitlement, planRank, type PlanId } from 'samwell-shared';

import { billing, type BillingService } from './billing.js';
import { db } from './db.js';

const ACCOUNT_PREFIX = 'account:';

const GUEST_PREFIX = 'guest:';

/**
 * The ledger an event belongs to.
 *
 * Three cases, and the third is the one with teeth:
 *
 *  - a bare id is a Logto subject, because that is what the app passes to
 *    `Purchases.logIn`, and the column stores the prefixed form;
 *  - a `guest:` id is a device that bought without an account, and it is
 *    already its own ledger key;
 *  - a `guest:` id that has since been LINKED belongs to the account it was
 *    linked to. RevenueCat will not move a subscription off an identified id,
 *    so renewals keep arriving under the guest id for as long as the
 *    subscription lives. Without this lookup they would credit an identity
 *    nobody can sign in as, and the reader would watch their plan lapse while
 *    being charged for it.
 */
async function toAccountId(appUserId: string): Promise<string> {
  if (appUserId.startsWith(GUEST_PREFIX)) {
    const linked = await db.execute({
      sql: 'SELECT linked_account_id FROM guest_identities WHERE guest_id = ?',
      args: [appUserId],
    });
    const linkedTo = linked.rows[0]?.linked_account_id;
    return linkedTo == null ? appUserId : String(linkedTo);
  }
  return appUserId.startsWith(ACCOUNT_PREFIX) ? appUserId : `${ACCOUNT_PREFIX}${appUserId}`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/** The entitlements an event names, in whatever shape RevenueCat sent them. */
function readEntitlementIds(event: RevenueCatEvent): string[] {
  const ids: string[] = [];
  if (typeof event.entitlement_id === 'string') ids.push(event.entitlement_id);
  if (Array.isArray(event.entitlement_ids)) {
    ids.push(...event.entitlement_ids.filter((id): id is string => typeof id === 'string'));
  }
  return ids;
}

/** The best plan an event names, or null when it names none of ours. */
function bestPlanOf(event: RevenueCatEvent): PlanId | null {
  let best: PlanId | null = null;
  let bestRank = -1;
  for (const id of readEntitlementIds(event)) {
    const plan = planForEntitlement(id);
    if (!plan) continue;
    const rank = planRank(plan);
    if (rank > bestRank) {
      best = plan;
      bestRank = rank;
    }
  }
  return best;
}

export type WebhookOutcome = {
  action: 'granted' | 'cleared' | 'reconciled' | 'ignored';
  note?: string;
};

/**
 * What one event means. Returns which action was taken so the caller can log
 * it, and throws nothing - every outcome is a 200 in the eyes of RevenueCat,
 * because a 4xx or 5xx here is a redelivery loop, not a correction.
 *
 * Grant dedupe rides on `grantMonthly`'s deterministic ledger id, keyed by
 * period end: a redelivered RENEWAL names the same period and stops; a
 * genuinely new period grants. Event ids are NOT the dedupe anchor - two
 * different event types can name one period, and one period must mean one
 * grant whatever announced it.
 */
export async function routeRevenueCatEvent(
  event: RevenueCatEvent,
  billing: BillingService,
): Promise<WebhookOutcome> {
  const type = event.type;
  const appUserId = typeof event.app_user_id === 'string' ? event.app_user_id : null;

  if (type === 'TEST') {
    // RevenueCat sends one of these when the webhook is first configured.
    return { action: 'ignored', note: 'test' };
  }

  if (type === 'TRANSFER') {
    /*
     * A transfer moves a subscription between app user ids: an anonymous
     * RevenueCat id merged into a signed-in one, or a restore onto a fresh
     * guest after a reinstall or a sign-out. The event carries the ids and
     * nothing else - no entitlement, no expiry - so `transferPlan` takes the
     * plan from the sender's row and moves it, rather than granting the
     * receiver a month that was already granted.
     */
    const fromIds = stringList(event.transferred_from);
    const toIds = stringList(event.transferred_to);
    const fromAccountIds = await Promise.all(fromIds.map(toAccountId));
    const eventId = typeof event.id === 'string' ? event.id : null;

    let moved = 0;
    for (const to of toIds) {
      const result = await billing.transferPlan({
        eventId,
        fromAccountIds,
        toAccountId: await toAccountId(to),
      });
      if (result.action === 'moved') moved += 1;
    }
    return {
      action: moved > 0 ? 'granted' : 'reconciled',
      note: `transfer from ${fromIds.length} to ${toIds.length} id(s)`,
    };
  }

  if (appUserId == null) {
    // An event we cannot attribute is worth knowing about but not worth
    // retrying for: no account means nothing to act on, whoever resends it.
    return { action: 'ignored', note: 'no app_user_id' };
  }
  const accountId = await toAccountId(appUserId);

  if (type === 'CANCELLATION') {
    /*
    * Cancellation keeps access through expiration. Sync so a concurrent
    * plan change is learned, but never let this event revoke access.
     */
    const synced = await billing.syncEntitlement(accountId, { clearIfInactive: false });
    if (synced.status === 'active') {
      return { action: 'reconciled', note: `${type}: ${synced.plan} remains active` };
    }
    return { action: 'ignored', note: `${type}: access preserved until expiration` };
  }

  if (type === 'EXPIRATION' || type === 'BILLING_ISSUE') {
    /*
    * Either event describes one product. Only the complete customer state
    * can prove access ended. During billing grace RevenueCat still reports
    * an active entitlement; in account hold it does not.
     */
    const synced = await billing.syncEntitlement(accountId);
    if (synced.status === 'active') {
      return { action: 'reconciled', note: `${type}: ${synced.plan} remains active` };
    }
    if (synced.status === 'inactive') return { action: 'cleared', note: type };
    return { action: 'ignored', note: `${type}: RevenueCat state unavailable` };
  }

  if (type === 'TEMPORARY_ENTITLEMENT_GRANT') {
    /*
     * An outage grant names no entitlement - the event carries little beyond
     * `app_user_id` - so the plan is read from RevenueCat, which does know
     * it. `syncEntitlement` recognises the grant by its length and marks it,
     * so the INITIAL_PURCHASE that follows confirms it rather than granting
     * a second month.
     */
    const synced = await billing.syncEntitlement(accountId, { clearIfInactive: false });
    if (synced.status === 'active') {
      return { action: 'reconciled', note: `${type}: ${synced.plan} for the outage` };
    }
    return { action: 'ignored', note: `${type}: RevenueCat state ${synced.status}` };
  }

  if (type === 'PRODUCT_CHANGE' || type === 'UNCANCELLATION') {
    const synced = await billing.syncEntitlement(accountId, { clearIfInactive: false });
    if (synced.status === 'active') {
      return { action: 'reconciled', note: `${type}: ${synced.plan} is active` };
    }
    // These are positive events. If the REST view lags, their own entitlement
    // payload remains safe to grant through the normal idempotent path below.
  }

  if (
    type === 'INITIAL_PURCHASE' ||
    type === 'RENEWAL' ||
    type === 'PRODUCT_CHANGE' ||
    type === 'UNCANCELLATION'
  ) {
    const plan = bestPlanOf(event);
    if (!plan) {
      return { action: 'ignored', note: `${type} names no entitlement of ours` };
    }
    const expirationAtMs =
      typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null;
    const result = await billing.grantMonthly({
      accountId,
      plan,
      periodEndMs: expirationAtMs,
      description: `${type} from RevenueCat`,
    });
    return {
      action: 'granted',
      note: result.granted
        ? `${plan} until ${expirationAtMs ?? '(no end)'}`
        : `duplicate for period ending ${expirationAtMs ?? '(no end)'}`,
    };
  }

  /*
   * Unknown types arrive the day RevenueCat invents them. Answering 200 keeps
   * their retry loop quiet; the log is the record that we saw it and did
   * nothing, which is the honest description of what happened.
   */
  return { action: 'ignored', note: `unknown event type '${String(type)}'` };
}

/** What the endpoint accepts. Deliberately loose: fields are read defensively,
 * because RevenueCat extends this payload without telling anybody. */
export interface RevenueCatEvent {
  type?: unknown;
  id?: unknown;
  app_user_id?: unknown;
  entitlement_id?: unknown;
  entitlement_ids?: unknown;
  expiration_at_ms?: unknown;
  /** TRANSFER only. The ids a subscription left, and the ids it went to. */
  transferred_from?: unknown;
  transferred_to?: unknown;
}

/**
 * Constant-time comparison of the shared secret.
 *
 * Both sides are hashed first so the comparison is always between equal
 * lengths - `timingSafeEqual` throws on a length mismatch, and the length of
 * a mismatched secret is itself a (thin) oracle.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHmac('sha256', 'samwell-webhook').update(provided).digest();
  const b = createHmac('sha256', 'samwell-webhook').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function createBillingWebhookRoutes(billing: BillingService): Hono {
  const routes = new Hono();

  routes.post('/revenuecat/webhook', async (c) => {
    const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!expected) {
      console.error('[Billing] REVENUECAT_WEBHOOK_SECRET is not configured; refusing webhook.');
      return c.json({ error: 'webhook_not_configured' }, 500);
    }

    const header = c.req.header('authorization')?.trim() ?? '';
    const provided = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : header;
    if (!provided || !secretMatches(provided, expected)) {
      return c.json({ error: 'invalid_authorization' }, 401);
    }

    let payload: { event?: RevenueCatEvent } | null = null;
    try {
      payload = (await c.req.json()) as { event?: RevenueCatEvent } | null;
    } catch {
      return c.json({ error: 'invalid_payload' }, 400);
    }
    const event = payload?.event;
    if (!event || typeof event !== 'object') {
      return c.json({ error: 'invalid_payload' }, 400);
    }

    const outcome = await routeRevenueCatEvent(event, billing);
    if (outcome.action === 'ignored') {
      console.log(`[Billing] Webhook event ignored: ${outcome.note ?? '(no note)'}`);
    } else {
      console.log(`[Billing] Webhook event ${outcome.action}: ${outcome.note ?? event.type}`);
    }
    // Always 200 once authenticated: a non-200 is a RevenueCat retry loop,
    // and there is nothing a retry could do better than we just did.
    return c.json({ ok: true, action: outcome.action });
  });

  return routes;
}

/** The production routes, bound to the shared billing service. */
export const billingWebhookRoutes = createBillingWebhookRoutes(billing);
