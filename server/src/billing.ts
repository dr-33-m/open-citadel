/**
 * The credit ledger: what an account holds, holds in reserve, and has spent.
 *
 * Two tables and a rule. `credit_ledger` is the truth - every credit that
 * enters or leaves an account is a row in it, and `reconcileBalance` can
 * rebuild any balance from nothing else. `account_credits` is the cache the
 * hot path reads, because summing the ledger on every turn would put the
 * whole history in front of every reply. The rule is that every mutation
 * writes the ledger, and a cache that disagrees with the ledger is wrong by
 * definition; the crash windows below are the reason the rule matters.
 *
 * ## Why single statements
 *
 * Every operation here is one atomic SQL statement wherever a decision is
 * being made, never a read-then-write in application code. The reasoning is
 * the same one `reserveUsageEvent` records: two concurrent requests must not
 * both observe the same balance and both act on it. That was probed rather
 * than assumed on this stack - libsql throws SQLITE_BUSY on concurrent
 * explicit transactions rather than waiting on them (eleven of twelve failed
 * under load), so `db.transaction()` is not usable here, while concurrent
 * single statements serialize perfectly. The trade is a small window between
 * the statements of one logical operation, and every window below closes in
 * the conservative direction:
 *
 *  - a hold taken without a stamp understates what the reader may spend
 *    (a reconcile heals it);
 *  - a settle recorded on the event without a debit undercharges the house,
 *    and the ledger row that would have recorded it is simply missing, so
 *    reconcile agrees with what the reader was actually charged;
 *  - the reverse - charging twice - is made impossible by the event row's
 *    status transition, which exactly one caller can win.
 *
 * ## The single-winner gate
 *
 * `usage_events.status` is only ever moved from `'started'` by one conditional
 * UPDATE, and that statement RETURNs what the next step needs (the account the
 * event belongs to, the hold stamped on it). Whoever's statement touches the
 * row first commits the outcome - settled or released - and every other
 * contender sees zero rows and stops. That is what makes a retried settle, a
 * release racing the sweep, or a late arrival after a crash unable to move
 * money twice.
 *
 * ## Libsql quirks this module leans on
 *
 * On an UPDATE with RETURNING, libsql reports `rowsAffected` as 0 even when
 * rows come back - so statements that RETURN are checked by `rows.length`,
 * and statements that do not RETURN are checked by `rowsAffected`. Both are
 * load-bearing; changing either one silently breaks the gate.
 */
import { randomBytes } from 'node:crypto';

import type { Client } from '@libsql/client';

import {
    CREDIT_PLANS,
    NO_PLAN_BALANCE,
    applyMonthlyGrant,
    planForEntitlement,
    planRank,
    type CreditBalance,
    type CreditSource,
    type PlanId,
} from 'samwell-shared';

import { db } from './db.js';

/**
 * How long a reservation may sit on a `'started'` event before the sweep
 * releases it. Longer than any legitimate turn (the app itself gives up at
 * ten minutes) and shorter than "a while". Only the server enforces this, so
 * it lives here rather than in samwell-shared.
 */
export const STALE_RESERVATION_MS = 15 * 60_000;

/** How long `readEntitlement` trusts its own answer before looking again. */
export const ENTITLEMENT_CACHE_TTL_MS = 60_000;

const REVENUECAT_API = 'https://api.revenuecat.com/v1/subscribers';
const ACCOUNT_PREFIX = 'account:';

/** How long an insider code may grant for, per the plan: up to a year. */
export const INSIDER_MAX_DURATION_DAYS = 365;
/** The rhythm of the insider regrant, matching a subscription's period. */
export const INSIDER_PERIOD_MS = 30 * 86_400_000;

export interface BillingOptions {
  /** Injectable so tests can run against a throwaway database. */
  client: Client;
  /** Injectable clock. */
  now?: () => number;
  /** Injectable for the RevenueCat REST reconcile in tests. */
  fetchImpl?: typeof fetch;
  /** Defaults to `REVENUECAT_SECRET_API_KEY`, read per call, not at import. */
  revenueCatApiKey?: string;
  cacheTtlMs?: number;
}

// -- Results -----------------------------------------------------------------

export type ReserveResult =
  | { allowed: true }
  | { allowed: false; reason: 'no_subscription' }
  | {
      allowed: false;
      reason: 'insufficient_credits';
      available: number;
      required: number;
    };

export type SettleResult = { settled: true; balance: number } | { settled: false };

export interface SettleUsage {
  promptTokens?: number | null;
  /** Of `promptTokens`, how many the provider served from cache. */
  cachedPromptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
}

export interface PriceSnapshot {
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
}

export interface GrantResult {
  granted: boolean;
  balance: number;
}

export interface ReconcileResult {
  balance: number;
  adjusted: number;
}

export type EntitlementSyncResult =
  | { status: 'active'; plan: PlanId }
  | { status: 'inactive' }
  | { status: 'unavailable' };

export interface BillingService {
  readEntitlement(accountId: string): Promise<CreditBalance>;
  /** Bypasses the cache and replaces the effective plan from RevenueCat's complete customer state. */
  syncEntitlement(
    accountId: string,
    options?: { clearIfInactive?: boolean },
  ): Promise<EntitlementSyncResult>;
  grantMonthly(args: {
    accountId: string;
    plan: PlanId;
    /** Null for an entitlement that does not expire. */
    periodEndMs: number | null;
    periodStartMs?: number;
    /** Dedupe anchor; defaults to the period end. */
    idempotencyKey?: string;
    source?: CreditSource;
    description?: string;
  }): Promise<GrantResult>;
  /** Clears the plan, keeps the balance for the record. */
  clearPlan(accountId: string): Promise<void>;
  /**
   * Fresh available credits, read straight from the row.
   *
   * `readEntitlement` caches; this deliberately does not. Anything deciding
   * whether a turn may proceed is a money decision, and a sixty-second-old
   * answer is not good enough to spend against.
   */
  peekCredits(accountId: string): Promise<{ plan: PlanId | null; available: number } | null>;
  reserveCredits(args: {
    accountId: string;
    /** The `'started'` usage event this hold belongs to. Must exist. */
    usageEventId: string;
    credits: number;
  }): Promise<ReserveResult>;
  settleCredits(args: {
    usageEventId: string;
    /** The real cost, in credits. Never the estimate. */
    actualCredits: number;
    usage?: SettleUsage;
    priceSnapshot?: PriceSnapshot;
    description?: string;
  }): Promise<SettleResult>;
  releaseReservation(args: { usageEventId: string; error?: string }): Promise<boolean>;
  sweepStaleReservations(): Promise<number>;
  reconcileBalance(accountId: string): Promise<ReconcileResult>;
  issueInsiderInvite(args: {
    plan: PlanId;
    durationDays: number;
    note?: string;
  }): Promise<{ code: string; plan: PlanId; durationDays: number }>;
  redeemInsiderInvite(args: {
    accountId: string;
    code: string;
  }): Promise<
    | { redeemed: true; balance: CreditBalance }
    | { redeemed: false; reason: 'unknown_code' | 'already_redeemed' | 'already_subscribed' }
  >;
  /** Regrants the accounts on insider terms whose period has ended. */
  sweepInsiderRegrants(): Promise<number>;
  /** Recent ledger rows, newest first, for the history sheet. */
  readLedger(
    accountId: string,
    limit: number,
  ): Promise<
    {
      id: string;
      type: string;
      credits: number;
      balanceAfter: number;
      modelId: string | null;
      requestId: string | null;
      description: string | null;
      createdAt: string;
    }[]
  >;
}

export function createBillingService(options: BillingOptions): BillingService {
  const client = options.client;
  const now = options.now ?? (() => Date.now());
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const cacheTtlMs = options.cacheTtlMs ?? ENTITLEMENT_CACHE_TTL_MS;

  /*
   * Only answers that carry a plan are cached, and only briefly. A cached
   * "no plan" would outlive the webhook that just granted one: the app polls
   * `/billing/me` right after a purchase, and a negative cached for the TTL
   * would answer every poll in the window with the pre-purchase truth. The
   * cache's real job is keeping the REST reconcile off the hot path, and a
   * reader without a plan has nothing to reconcile.
   */
  const cache = new Map<string, { expiresAtMs: number; balance: CreditBalance }>();

  function invalidate(accountId: string): void {
    cache.delete(accountId);
  }

  function readAccountRow(accountId: string): Promise<{
    plan: PlanId | null;
    source: 'subscription' | 'insider' | null;
    balance: number;
    reserved: number;
    periodEndMs: number | null;
  } | null> {
    return client
      .execute({
        sql: 'SELECT plan, source, balance, reserved, period_end_ms FROM account_credits WHERE account_id = ?',
        args: [accountId],
      })
      .then((result) => {
        const row = result.rows[0];
        if (!row) return null;
        const plan = row.plan == null ? null : (String(row.plan) as PlanId);
        const source =
          row.source == null ? null : (String(row.source) as 'subscription' | 'insider');
        return {
          plan,
          source,
          balance: Number(row.balance ?? 0),
          reserved: Number(row.reserved ?? 0),
          periodEndMs: row.period_end_ms == null ? null : Number(row.period_end_ms),
        };
      });
  }

  function toCreditBalance(
    row: NonNullable<Awaited<ReturnType<typeof readAccountRow>>>,
  ): CreditBalance {
    const plan = row.plan && row.plan in CREDIT_PLANS ? row.plan : null;
    return {
      plan,
      source: plan ? row.source : null,
      balance: row.balance,
      reserved: row.reserved,
      /*
       * Clamped for display, and zero when there is no plan: a lapsed
       * subscription leaves a balance on the row that the reserve gate will
       * not sell against, and showing it as available would invite the reader
       * to start a message the server is about to refuse. The gate uses the
       * raw difference, so nothing spendable is decided here.
       */
      available: plan ? Math.max(0, row.balance - row.reserved) : 0,
      grant: plan ? CREDIT_PLANS[plan].monthlyCredits : 0,
      periodEndsAt: row.periodEndMs == null ? null : new Date(row.periodEndMs).toISOString(),
    };
  }

  async function insertLedgerRow(row: {
    id: string;
    accountId: string;
    type: string;
    credits: number;
    balanceAfter: number;
    modelId?: string | null;
    requestId?: string | null;
    description?: string | null;
    atMs: number;
  }): Promise<void> {
    await client.execute({
      sql: `INSERT INTO credit_ledger (
          id, account_id, type, credits, balance_after, model_id, request_id, description, created_at_ms
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        row.id,
        row.accountId,
        row.type,
        row.credits,
        row.balanceAfter,
        row.modelId ?? null,
        row.requestId ?? null,
        row.description ?? null,
        row.atMs,
      ],
    });
  }

  /** Releases a hold on the cache row, clamped so it can never go negative. */
  async function releaseHold(accountId: string, credits: number, atMs: number): Promise<void> {
    if (credits <= 0) return;
    await client.execute({
      sql: `UPDATE account_credits
            SET reserved = MAX(0, reserved - ?), updated_at_ms = ?
            WHERE account_id = ?`,
      args: [credits, atMs, accountId],
    });
  }

  // -- Entitlement -------------------------------------------------------------

  async function readEntitlement(accountId: string): Promise<CreditBalance> {
    const atMs = now();
    const cached = cache.get(accountId);
    if (cached && cached.expiresAtMs > atMs) return cached.balance;

    let row = await readAccountRow(accountId);
    /*
     * Stale means the period has ended and no webhook has renewed the row
     * yet. The REST call is the safety net for exactly that: RevenueCat knows
     * whether the subscription renewed even when its webhook is late, so the
     * answer is written back through `grantMonthly` and the row stops being
     * stale. When the key is not configured, or the call fails, the row is
     * trusted as it stands - a paying reader is never logged out on a
     * transient blip, and a genuinely lapsed subscription is corrected by its
    * own EXPIRATION webhook. A successful full-customer response with no
    * active entitlement clears the plan; unavailable responses preserve it.
     */
    if (!row || isStale(row, atMs)) {
      await syncEntitlement(accountId);
      row = await readAccountRow(accountId);
    }

    // A copy, not the shared constant: a caller mutating the answer must not
    // be able to corrupt the shared object for everyone after them.
    const balance = row ? toCreditBalance(row) : { ...NO_PLAN_BALANCE };
    if (balance.plan) {
      cache.set(accountId, { expiresAtMs: atMs + cacheTtlMs, balance });
    }
    return balance;
  }

  function isStale(
    row: { plan: string | null; periodEndMs: number | null },
    atMs: number,
  ): boolean {
    return row.plan != null && row.periodEndMs != null && row.periodEndMs < atMs;
  }

  /**
   * Ask RevenueCat what the account actually holds, and write it back.
   *
  * Returns the authoritative state, or unavailable when no safe decision can
  * be made. The subscriber id is the bare Logto subject - the app calls
  * `Purchases.logIn(sub)` - while the column stores the prefixed account id,
  * so the prefix comes off here and nowhere else.
   */
  async function syncEntitlement(
    accountId: string,
    syncOptions: { clearIfInactive?: boolean } = {},
  ): Promise<EntitlementSyncResult> {
    const atMs = now();
    const apiKey = options.revenueCatApiKey ?? process.env.REVENUECAT_SECRET_API_KEY;
    if (!apiKey) return { status: 'unavailable' };

    const sub = accountId.startsWith(ACCOUNT_PREFIX) ? accountId.slice(ACCOUNT_PREFIX.length) : accountId;
    try {
      const response = await doFetch(`${REVENUECAT_API}/${encodeURIComponent(sub)}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        console.error(
          `[Billing] RevenueCat reconcile for ${accountId} answered ${response.status}.`,
        );
        return { status: 'unavailable' };
      }
      const payload = (await response.json()) as {
        subscriber?: {
          entitlements?: Record<
            string,
            { expires_date?: string | null; product_identifier?: string | null }
          >;
        };
      };
      const entitlements = payload.subscriber?.entitlements ?? {};

      // Active means no expiry (a lifetime grant) or an expiry in the future.
      // Of the active ones the best plan wins, for the same reason
      // `bestPlan` exists: an overlap must never read as the lesser tier.
      let best: { plan: PlanId; expiresAtMs: number | null; key: string } | null = null;
      for (const [key, entitlement] of Object.entries(entitlements)) {
        const plan = planForEntitlement(key);
        if (!plan) continue;
        const expiresAtMs = entitlement.expires_date ? Date.parse(entitlement.expires_date) : null;
        if (expiresAtMs !== null && expiresAtMs <= atMs) continue;
        if (!best || planRank(plan) > planRank(best.plan)) {
          best = { plan, expiresAtMs, key };
        }
      }
      const current = await readAccountRow(accountId);
      if (!best) {
        // Insider terms have their own local expiry and regrant lifecycle.
        // An empty store customer must not revoke one of those grants.
        if (syncOptions.clearIfInactive !== false && current?.source !== 'insider') {
          await clearPlan(accountId);
        }
        return { status: 'inactive' };
      }

      /*
       * Product changes can keep the same billing-period end. That is a plan
       * transition, not another monthly grant. It also heals a row that an
       * older EXPIRATION handler cleared while another entitlement remained.
       */
      if (current && current.periodEndMs === best.expiresAtMs) {
        await client.execute({
          sql: `UPDATE account_credits
                SET plan = ?, source = ?, period_end_ms = ?, updated_at_ms = ?
                WHERE account_id = ?`,
          args: [
            best.plan,
            current.source === 'insider' ? 'insider' : 'subscription',
            best.expiresAtMs,
            atMs,
            accountId,
          ],
        });
        invalidate(accountId);
        return { status: 'active', plan: best.plan };
      }

      await grantMonthly({
        accountId,
        plan: best.plan,
        periodEndMs: best.expiresAtMs,
        idempotencyKey: `period:${best.expiresAtMs ?? 'lifetime'}`,
        source: current?.source === 'insider' ? 'insider' : 'subscription',
        description: 'Reconciled from RevenueCat',
      });
      return { status: 'active', plan: best.plan };
    } catch (error) {
      console.error(`[Billing] RevenueCat reconcile failed for ${accountId}:`, error);
      return { status: 'unavailable' };
    }
  }

  // -- Grants ------------------------------------------------------------------

  async function grantMonthly(args: {
    accountId: string;
    plan: PlanId;
    periodEndMs: number | null;
    periodStartMs?: number;
    idempotencyKey?: string;
    source?: CreditSource;
    description?: string;
  }): Promise<GrantResult> {
    const plan = CREDIT_PLANS[args.plan];
    const source = args.source ?? 'subscription';
    const atMs = now();
    const key = args.idempotencyKey ?? `period:${args.periodEndMs ?? 'lifetime'}`;
    const grantId = `grant:${args.accountId}:${key}`;

    const current = await readAccountRow(args.accountId);
    const applied = applyMonthlyGrant(current?.balance ?? 0, plan);

    /*
     * The deterministic id is the whole idempotency story: a webhook
     * redelivered, a reconcile run twice, or an insider regrant racing its
     * predecessor all land on the same row id, and the conflict is the signal
     * to stop. Nothing about the balance is touched on this path, so a
     * duplicate event cannot double-grant.
     */
    const inserted = await client.execute({
      sql: `INSERT INTO credit_ledger (
          id, account_id, type, credits, balance_after, description, created_at_ms
        )
        VALUES (?, ?, 'MONTHLY_GRANT', ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
      args: [
        grantId,
        args.accountId,
        plan.monthlyCredits,
        applied.balance,
        args.description ?? `Monthly grant, ${plan.label}`,
        atMs,
      ],
    });
    if (inserted.rowsAffected === 0) {
      /*
       * Already granted for this period. The cache may still disagree with
       * the ledger if the first attempt crashed between writing the grant row
       * and updating the cache - the redelivery is the one caller guaranteed
       * to come back, so it does the repair rather than merely reporting.
       */
      const healed = await reconcileBalance(args.accountId);
      return { granted: false, balance: healed.balance };
    }

    if (applied.expired > 0) {
      /*
       * Written off before the grant reads, so the ledger reads as one story:
       * the carry-over was trimmed, then the new month landed. Both rows
       * carry `balance_after`, so the arithmetic is checkable either way.
       */
      await insertLedgerRow({
        id: `expire:${args.accountId}:${key}`,
        accountId: args.accountId,
        type: 'EXPIRATION',
        credits: -applied.expired,
        balanceAfter: applied.balance - plan.monthlyCredits,
        description: `Rollover above the ${plan.rolloverCap.toLocaleString('en-US')} credit cap written off`,
        atMs,
      });
    }

    /*
     * `reserved` is deliberately not in this upsert: a hold belongs to a turn
     * that may still be in flight, and a renewal landing mid-turn must not
     * drop it. The reserve gate tolerates a reservation larger than the new
     * balance - it simply refuses new turns until the settle comes home.
     */
    await client.execute({
      sql: `INSERT INTO account_credits (
          account_id, plan, source, balance, reserved, period_start_ms, period_end_ms, updated_at_ms
        )
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          plan = excluded.plan,
          source = excluded.source,
          balance = excluded.balance,
          period_start_ms = excluded.period_start_ms,
          period_end_ms = excluded.period_end_ms,
          updated_at_ms = excluded.updated_at_ms`,
      args: [
        args.accountId,
        args.plan,
        source,
        applied.balance,
        args.periodStartMs ?? atMs,
        args.periodEndMs,
        atMs,
      ],
    });
    invalidate(args.accountId);
    return { granted: true, balance: applied.balance };
  }

  async function clearPlan(accountId: string): Promise<void> {
    /*
     * No ledger row, because nothing moved: the balance stays for the record
     * exactly as the plan describes, and a zero-credit row describing "the
     * plan ended" is audit noise, not money.
     */
    await client.execute({
      sql: `UPDATE account_credits
            SET plan = NULL, source = NULL, updated_at_ms = ?
            WHERE account_id = ?`,
      args: [now(), accountId],
    });
    invalidate(accountId);
  }

  // -- Insiders ----------------------------------------------------------------

  /** A code a human reads out loud and types. Grouped, uppercase, unambiguous. */
  function newInviteCode(): string {
    return randomBytes(10)
      .toString('hex')
      .toUpperCase()
      .replace(/(.{5})/g, '$1-')
      .slice(0, -1);
  }

  async function issueInsiderInvite(args: {
    plan: PlanId;
    durationDays: number;
    note?: string;
  }): Promise<{ code: string; plan: PlanId; durationDays: number }> {
    const durationDays = Math.max(1, Math.min(INSIDER_MAX_DURATION_DAYS, Math.floor(args.durationDays)));
    const code = newInviteCode();
    await client.execute({
      sql: `INSERT INTO insider_invites (code, plan, duration_days, note, created_at_ms)
            VALUES (?, ?, ?, ?, ?)`,
      args: [code, args.plan, durationDays, args.note ?? null, now()],
    });
    return { code, plan: args.plan, durationDays };
  }

  /**
   * Hold the entitlement in RevenueCat too, so `readEntitlement` keeps
   * exactly one shape to reason about and the REST reconcile can see an
   * insider grant it otherwise knows nothing of.
   *
   * Best effort: the server-side row is the truth for us either way, and a
   * failure here is logged rather than allowed to fail a redemption that has
   * already succeeded on our side.
   */
  async function grantRevenueCatEntitlement(
    accountId: string,
    plan: PlanId,
    expiresAtMs: number,
  ): Promise<void> {
    const apiKey = options.revenueCatApiKey ?? process.env.REVENUECAT_SECRET_API_KEY;
    if (!apiKey) return;
    const sub = accountId.startsWith(ACCOUNT_PREFIX)
      ? accountId.slice(ACCOUNT_PREFIX.length)
      : accountId;
    try {
      const response = await doFetch(
        `${REVENUECAT_API}/${encodeURIComponent(sub)}/entitlements/${CREDIT_PLANS[plan].entitlement}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ expires_at: new Date(expiresAtMs).toISOString() }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) {
        console.error(
          `[Billing] RevenueCat entitlement grant answered ${response.status} for ${accountId}.`,
        );
      }
    } catch (error) {
      console.error(`[Billing] RevenueCat entitlement grant failed for ${accountId}:`, error);
    }
  }

  async function redeemInsiderInvite(args: {
    accountId: string;
    code: string;
  }): Promise<
    | { redeemed: true; balance: CreditBalance }
    | { redeemed: false; reason: 'unknown_code' | 'already_redeemed' | 'already_subscribed' }
  > {
    const atMs = now();
    const code = args.code.trim().toUpperCase();

    const invite = await client.execute({
      sql: 'SELECT plan, duration_days, redeemed_by FROM insider_invites WHERE code = ?',
      args: [code],
    });
    const inviteRow = invite.rows[0];
    if (!inviteRow) return { redeemed: false, reason: 'unknown_code' };
    if (inviteRow.redeemed_by != null) return { redeemed: false, reason: 'already_redeemed' };

    const plan = String(inviteRow.plan) as PlanId;
    if (!(plan in CREDIT_PLANS)) return { redeemed: false, reason: 'unknown_code' };

    /*
     * A live paid subscription outranks a code. Redeeming over one would
     * overwrite the cache row with the insider plan while the store
     * subscription carried on billing, and the two sides would disagree until
     * the next renewal. The code is left unredeemed, so it can be handed to
     * somebody who needs it.
     */
    const current = await readAccountRow(args.accountId);
    const subscribed =
      current != null &&
      current.source === 'subscription' &&
      (current.periodEndMs == null || current.periodEndMs > atMs);
    if (subscribed) return { redeemed: false, reason: 'already_subscribed' };

    const termEndMs = atMs + Number(inviteRow.duration_days) * 86_400_000;
    const periodEndMs = Math.min(atMs + INSIDER_PERIOD_MS, termEndMs);

    /*
     * The claim is the single-winner gate for the code: two devices redeeming
     * the same code concurrently cannot both win the conditional UPDATE, and
     * the loser reports it as already taken.
     */
    const claim = await client.execute({
      sql: `UPDATE insider_invites
            SET redeemed_by = ?, redeemed_at_ms = ?, expires_at_ms = ?
            WHERE code = ? AND redeemed_by IS NULL`,
      args: [args.accountId, atMs, termEndMs, code],
    });
    if (claim.rowsAffected === 0) return { redeemed: false, reason: 'already_redeemed' };

    await grantMonthly({
      accountId: args.accountId,
      plan,
      periodEndMs,
      periodStartMs: atMs,
      idempotencyKey: `insider:${code}:period:${periodEndMs}`,
      source: 'insider',
      description: `Insider code ${code}`,
    });
    await grantRevenueCatEntitlement(args.accountId, plan, termEndMs);
    return { redeemed: true, balance: await readEntitlement(args.accountId) };
  }

  /**
   * Carry insider terms forward, one period at a time, until the term ends.
   *
   * Insiders have no webhook to renew them - there is no store transaction -
   * so a timer plays the part one plays for subscriptions. The first period
   * is granted at redemption and each sweep extends by one period, bounded by
   * the term's end; a term that has run out ends the plan the way an
   * expiration would, balance left for the record.
   */
  async function sweepInsiderRegrants(): Promise<number> {
    const atMs = now();
    const due = await client.execute({
      sql: `SELECT i.code, i.plan, i.expires_at_ms, a.account_id, a.period_end_ms
            FROM account_credits a
            JOIN insider_invites i ON i.redeemed_by = a.account_id
            WHERE a.source = 'insider'
              AND a.plan IS NOT NULL
              AND a.period_end_ms IS NOT NULL
              AND a.period_end_ms <= ?`,
      args: [atMs],
    });

    let regranted = 0;
    for (const row of due.rows) {
      const accountId = String(row.account_id);
      const code = String(row.code);
      const plan = String(row.plan) as PlanId;
      if (!(plan in CREDIT_PLANS)) continue;

      const termEndMs = Number(row.expires_at_ms);
      const periodEndMs = Number(row.period_end_ms);
      if (periodEndMs >= termEndMs) {
        await clearPlan(accountId);
        continue;
      }
      const nextPeriodEndMs = Math.min(periodEndMs + INSIDER_PERIOD_MS, termEndMs);
      if (nextPeriodEndMs <= atMs) {
        /*
         * The remaining term is already in the past: the sweep ran late
         * enough that no unexpired period is left to grant. The term ends
         * here rather than granting credits for time that is over - the
         * balance stays for the record, and a sweep that runs on time never
         * reaches this branch.
         */
        await clearPlan(accountId);
        continue;
      }
      const result = await grantMonthly({
        accountId,
        plan,
        periodEndMs: nextPeriodEndMs,
        idempotencyKey: `insider:${code}:period:${nextPeriodEndMs}`,
        source: 'insider',
        description: `Insider regrant, code ${code}`,
      });
      if (result.granted) regranted += 1;
    }
    return regranted;
  }

  // -- The turn lifecycle ------------------------------------------------------

  async function peekCredits(
    accountId: string,
  ): Promise<{ plan: PlanId | null; available: number } | null> {
    const row = await readAccountRow(accountId);
    if (!row) return null;
    return {
      plan: row.plan && row.plan in CREDIT_PLANS ? row.plan : null,
      available: Math.max(0, row.balance - row.reserved),
    };
  }

  async function reserveCredits(args: {
    accountId: string;
    usageEventId: string;
    credits: number;
  }): Promise<ReserveResult> {
    const credits = Math.max(0, Math.floor(args.credits));
    const atMs = now();

    /*
     * The gate, in one statement. `plan IS NOT NULL` is part of it: an
     * expired subscription leaves a cache row with a leftover balance, and
     * that balance is a record, not spendable credit - refusing it here means
     * the metering route's own plan check can never be the only thing between
     * a lapsed reader and an inference bill.
     *
     * `rowsAffected === 0` covers "no row", "no plan" and "not enough" in one
     * read; the classification query below runs only on the failure path,
     * where a concurrent grant or settle changing the answer between the two
     * statements costs a slightly wrong error message and nothing else.
     */
    const gate = await client.execute({
      sql: `UPDATE account_credits
            SET reserved = reserved + ?, updated_at_ms = ?
            WHERE account_id = ? AND plan IS NOT NULL AND balance - reserved >= ?`,
      args: [credits, atMs, args.accountId, credits],
    });
    if (gate.rowsAffected === 0) {
      const row = await readAccountRow(args.accountId);
      if (!row || row.plan == null) return { allowed: false, reason: 'no_subscription' };
      return {
        allowed: false,
        reason: 'insufficient_credits',
        available: Math.max(0, row.balance - row.reserved),
        required: credits,
      };
    }

    /*
     * Stamp the event so the hold is findable - the sweep looks for stamped
     * holds on `'started'` events, and settle reads the stamped amount back.
     * If the stamp lands on nothing, the hold is compensated immediately:
     * an untracked hold would understate the reader's available credits
     * until a reconcile, and there is no legitimate way to reach this branch
     * (the event is created before credits are reserved), so it throws rather
     * than pretends.
     */
    const stamp = await client.execute({
      sql: `UPDATE usage_events SET credits_reserved = ?
            WHERE id = ? AND status = 'started'`,
      args: [credits, args.usageEventId],
    });
    if (stamp.rowsAffected === 0) {
      await releaseHold(args.accountId, credits, atMs);
      throw new Error(
        `[Billing] reserveCredits: usage event '${args.usageEventId}' is missing or no longer 'started'. ` +
          'The event must be reserved before credits are.',
      );
    }
    return { allowed: true };
  }

  async function settleCredits(args: {
    usageEventId: string;
    actualCredits: number;
    usage?: SettleUsage;
    priceSnapshot?: PriceSnapshot;
    description?: string;
  }): Promise<SettleResult> {
    const debit = Math.max(0, Math.floor(args.actualCredits));
    const usage = args.usage ?? {};
    const snapshot = args.priceSnapshot;
    const atMs = now();

    /*
     * The single-winner gate. Only a caller whose UPDATE touches the row
     * settles it; a retry, a late arrival after the sweep, or a duplicate
     * stream-end sees zero rows and stops without touching money.
     */
    const transition = await client.execute({
      sql: `UPDATE usage_events SET
          status = 'completed',
          completed_at_ms = ?,
          prompt_tokens = ?,
          cached_prompt_tokens = ?,
          completion_tokens = ?,
          total_tokens = ?,
          cost_usd = ?,
          credits_charged = ?,
          input_price_snapshot = ?,
          output_price_snapshot = ?
        WHERE id = ? AND status = 'started'
        RETURNING account_id, model_id, credits_reserved`,
      args: [
        atMs,
        usage.promptTokens ?? null,
        usage.cachedPromptTokens ?? null,
        usage.completionTokens ?? null,
        usage.totalTokens ?? null,
        usage.costUsd ?? null,
        debit,
        snapshot?.inputPricePerMillion ?? null,
        snapshot?.outputPricePerMillion ?? null,
        args.usageEventId,
      ],
    });
    const won = transition.rows[0];
    if (!won) return { settled: false };

    // The event row names the account; the caller's opinion is not consulted,
    // so a wiring mistake cannot debit the wrong reader.
    const owner = String(won.account_id);
    const hold = Math.max(0, Number(won.credits_reserved ?? 0));
    const modelId = won.model_id == null ? null : String(won.model_id);

    const updated = await client.execute({
      sql: `UPDATE account_credits
            SET balance = balance - ?, reserved = MAX(0, reserved - ?), updated_at_ms = ?
            WHERE account_id = ?
            RETURNING balance`,
      args: [debit, hold, atMs, owner],
    });
    const balanceRow = updated.rows[0];
    if (!balanceRow) {
      /*
       * The event is marked complete, so nothing can double-charge, but there
       * is no cache row to debit and no balance to write the ledger against.
       * Reaching this at all is a wiring bug - a turn settled for an account
       * that never held one - so it is said loudly and nothing is invented.
       */
      console.error(
        `[Billing] Settled event '${args.usageEventId}' for '${owner}' but no ` +
          'account_credits row exists. Nothing was debited and nothing was charged.',
      );
      return { settled: true, balance: 0 };
    }

    const balance = Number(balanceRow.balance);
    await insertLedgerRow({
      id: `usage:${args.usageEventId}`,
      accountId: owner,
      type: 'AI_USAGE',
      credits: -debit,
      balanceAfter: balance,
      modelId,
      requestId: args.usageEventId,
      description: args.description,
      atMs,
    });
    invalidate(owner);
    return { settled: true, balance };
  }

  async function releaseReservation(args: {
    usageEventId: string;
    error?: string;
  }): Promise<boolean> {
    const atMs = now();
    const transition = await client.execute({
      sql: `UPDATE usage_events SET
          status = 'errored',
          completed_at_ms = ?,
          error = COALESCE(?, error)
        WHERE id = ? AND status = 'started'
        RETURNING account_id, credits_reserved`,
      args: [atMs, args.error ?? null, args.usageEventId],
    });
    const won = transition.rows[0];
    if (!won) return false;

    const hold = Math.max(0, Number(won.credits_reserved ?? 0));
    await releaseHold(String(won.account_id), hold, atMs);
    return true;
  }

  /**
   * Release the holds of turns that never came home.
   *
   * A crash mid-stream leaves the event `'started'` and the hold in place;
   * nothing else will ever touch either. The same single-winner gate applies,
   * so a turn that settles a moment after being swept is not released twice -
   * and a settle that wins the row first makes the sweep's update a no-op.
   */
  async function sweepStaleReservations(): Promise<number> {
    const atMs = now();
    const stale = await client.execute({
      sql: `SELECT id FROM usage_events
            WHERE status = 'started'
              AND credits_reserved IS NOT NULL
              AND credits_reserved > 0
              AND created_at_ms <= ?`,
      args: [atMs - STALE_RESERVATION_MS],
    });

    let swept = 0;
    for (const row of stale.rows) {
      const id = String(row.id);
      const transition = await client.execute({
        sql: `UPDATE usage_events SET
            status = 'errored',
            completed_at_ms = ?,
            error = 'Reservation swept: the turn never settled.'
          WHERE id = ? AND status = 'started'
          RETURNING account_id, credits_reserved`,
        args: [atMs, id],
      });
      const won = transition.rows[0];
      if (!won) continue;
      await releaseHold(
        String(won.account_id),
        Math.max(0, Number(won.credits_reserved ?? 0)),
        atMs,
      );
      swept += 1;
    }
    return swept;
  }

  // -- The repair --------------------------------------------------------------

  /**
   * Rebuild the cache from the ledger.
   *
   * The sum is the truth and the cache is a misreading of it, so the repair
   * is a write to the cache alone. No correcting row goes into the ledger -
   * the credits did not move, and an adjustment row would change the very sum
   * the balance is being rebuilt from. (`ADMIN_ADJUSTMENT` exists for a
   * founder correcting a balance by hand, which is a movement of credit and
   * will get its own row when the admin route exists.)
   *
   * Idempotent by construction: against a healed cache the difference reads
   * zero and nothing happens.
   */
  async function reconcileBalance(accountId: string): Promise<ReconcileResult> {
    const atMs = now();
    const totalResult = await client.execute({
      sql: 'SELECT COALESCE(SUM(credits), 0) AS total FROM credit_ledger WHERE account_id = ?',
      args: [accountId],
    });
    const total = Number(totalResult.rows[0]?.total ?? 0);

    const row = await readAccountRow(accountId);
    const current = row?.balance ?? 0;
    const adjusted = total - current;
    if (row) {
      await client.execute({
        sql: 'UPDATE account_credits SET balance = ?, updated_at_ms = ? WHERE account_id = ?',
        args: [total, atMs, accountId],
      });
    } else if (total !== 0) {
      /*
       * Ledger rows with no cache row (a crash between the two writes of a
       * grant on a first purchase). The row is created with no plan: whatever
       * plan it belonged to is a question the entitlement answer, not the
       * balance arithmetic, is allowed to reopen.
       */
      await client.execute({
        sql: `INSERT INTO account_credits (account_id, balance, reserved, updated_at_ms)
              VALUES (?, ?, 0, ?)`,
        args: [accountId, total, atMs],
      });
    }
    invalidate(accountId);
    return { balance: total, adjusted };
  }

  async function readLedger(
    accountId: string,
    limit: number,
  ): Promise<
    {
      id: string;
      type: string;
      credits: number;
      balanceAfter: number;
      modelId: string | null;
      requestId: string | null;
      description: string | null;
      createdAt: string;
    }[]
  > {
    const result = await client.execute({
      sql: `SELECT id, type, credits, balance_after, model_id, request_id, description, created_at_ms
            FROM credit_ledger
            WHERE account_id = ?
            ORDER BY created_at_ms DESC, id DESC
            LIMIT ?`,
      args: [accountId, limit],
    });
    return result.rows.map((row) => ({
      id: String(row.id),
      type: String(row.type),
      credits: Number(row.credits),
      balanceAfter: Number(row.balance_after),
      modelId: row.model_id == null ? null : String(row.model_id),
      requestId: row.request_id == null ? null : String(row.request_id),
      description: row.description == null ? null : String(row.description),
      createdAt: new Date(Number(row.created_at_ms)).toISOString(),
    }));
  }

  return {
    readEntitlement,
    syncEntitlement,
    grantMonthly,
    clearPlan,
    peekCredits,
    reserveCredits,
    settleCredits,
    releaseReservation,
    sweepStaleReservations,
    reconcileBalance,
    issueInsiderInvite,
    redeemInsiderInvite,
    sweepInsiderRegrants,
    readLedger,
  };
}

/*
 * The production instance, bound to the shared database client. The bound
 * names below are what callers import, so a call site reads the same as
 * `db.ts`'s functions; the factory above is what the tests import.
 */
export const billing = createBillingService({ client: db });

export const {
  readEntitlement,
  grantMonthly,
  clearPlan,
  peekCredits,
  reserveCredits,
  settleCredits,
  releaseReservation,
  sweepStaleReservations,
  reconcileBalance,
  issueInsiderInvite,
  redeemInsiderInvite,
  sweepInsiderRegrants,
  readLedger,
} = billing;
