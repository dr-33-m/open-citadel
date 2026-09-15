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

const ACCOUNT_PREFIX = 'account:';

function toAccountId(appUserId: string): string {
  // RevenueCat's `app_user_id` is the bare Logto subject, because that is
  // what the app passes to `Purchases.logIn`. The column stores the prefixed
  // form, so the prefix goes on here and nowhere else.
  return appUserId.startsWith(ACCOUNT_PREFIX) ? appUserId : `${ACCOUNT_PREFIX}${appUserId}`;
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
     * A transfer moves a subscription between app user ids, which happens
     * when an anonymous RevenueCat id is merged into a signed-in one. The
     * anonymous id never held credits with us (we only grant on webhooks
     * keyed by the Logto subject), so the receiving side is the only one with
     * anything to do; the sending side is cleared in case one of our rows
     * somehow sits behind it. The balance stays on the cleared row, for the
     * record, as with every other loss of plan.
     */
    const fromIds = Array.isArray(event.transferred_from_app_user_ids)
      ? event.transferred_from_app_user_ids.filter((id): id is string => typeof id === 'string')
      : [];
    const toIds = Array.isArray(event.transferred_to_app_user_ids)
      ? event.transferred_to_app_user_ids.filter((id): id is string => typeof id === 'string')
      : [];

    for (const from of fromIds) {
      await billing.clearPlan(toAccountId(from));
    }
    const plan = bestPlanOf(event);
    if (plan && toIds.length > 0) {
      const expirationAtMs =
        typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null;
      for (const to of toIds) {
        await billing.grantMonthly({
          accountId: toAccountId(to),
          plan,
          periodEndMs: expirationAtMs,
          description: 'Entitlement transferred',
        });
      }
      return { action: 'granted', note: `transfer to ${toIds.length} account(s)` };
    }
    return { action: 'cleared', note: `transfer from ${fromIds.length} account(s)` };
  }

  if (appUserId == null) {
    // An event we cannot attribute is worth knowing about but not worth
    // retrying for: no account means nothing to act on, whoever resends it.
    return { action: 'ignored', note: 'no app_user_id' };
  }
  const accountId = toAccountId(appUserId);

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
    type === 'UNCANCELLATION' ||
    type === 'TEMPORARY_ENTITLEMENT_GRANT'
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
  transferred_from_app_user_ids?: unknown;
  transferred_to_app_user_ids?: unknown;
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
