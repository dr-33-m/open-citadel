/**
 * Insider codes: a plan the founder hands out for a set term.
 *
 * A code names a plan and one of four terms (a day, a week, a month, a
 * year). Redeeming it puts the account on that plan with `source: 'insider'`
 * and grants the first period's credits; the term is then carried forward a
 * period at a time until it ends, exactly as a renewal would carry a
 * subscription, by `advanceTerm`.
 *
 * Nothing here talks to RevenueCat, on purpose. An insider plan is not a
 * purchase, and this server's own row is what every route reads. Telling
 * RevenueCat about it as well would hand the reconcile in `billing.ts` an
 * entitlement that ends with the term rather than with the period, which it
 * would read as a new billing period: one month granted twice, then none for
 * the rest of the year. So a RevenueCat entitlement always means a real
 * purchase, and a real purchase always outranks a code.
 *
 * Split out of `billing.ts`, which hands in the few things this needs from
 * the ledger. It owns the `insider_invites` table and nothing else.
 */
import { randomBytes } from 'node:crypto';

import type { Client } from '@libsql/client';

import {
  CREDIT_PLANS,
  INSIDER_TERMS,
  insiderDurationForDays,
  normalizeInsiderCode,
  type CreditBalance,
  type CreditSource,
  type InsiderDuration,
  type InsiderRedemption,
  type PlanId,
} from 'samwell-shared';

const DAY_MS = 86_400_000;
/** The rhythm of the insider regrant, matching a subscription's period. */
export const INSIDER_PERIOD_MS = 30 * DAY_MS;

export interface InsiderInvite {
  code: string;
  plan: PlanId;
  duration: InsiderDuration;
  durationDays: number;
}

/** A code as the founder sees it in the list: what it is, and who has it. */
export interface InsiderInviteRecord {
  code: string;
  plan: PlanId;
  /** Null for a code minted before terms had names. */
  duration: InsiderDuration | null;
  durationDays: number;
  note: string | null;
  createdAt: string;
  redeemedBy: string | null;
  redeemedAt: string | null;
  /** When the plan it granted stops. Null until it is redeemed. */
  endsAt: string | null;
}

export type InsiderRedeemResult =
  | ({ redeemed: true; balance: CreditBalance } & InsiderRedemption)
  | { redeemed: false; reason: 'unknown_code' | 'already_redeemed' | 'already_subscribed' };

/** What this needs from the ledger. Narrow, so the two files cannot tangle. */
export interface InsiderDeps {
  client: Client;
  now: () => number;
  readAccount(accountId: string): Promise<{
    plan: PlanId | null;
    source: CreditSource | null;
    periodEndMs: number | null;
  } | null>;
  grantMonthly(args: {
    accountId: string;
    plan: PlanId;
    periodEndMs: number | null;
    periodStartMs?: number;
    idempotencyKey?: string;
    source?: CreditSource;
    description?: string;
  }): Promise<{ granted: boolean }>;
  clearPlan(accountId: string): Promise<void>;
  readEntitlement(accountId: string): Promise<CreditBalance>;
}

const iso = (ms: unknown): string | null => (ms == null ? null : new Date(Number(ms)).toISOString());

export function createInsiderTerms(deps: InsiderDeps) {
  const { client, now } = deps;

  /** A code a human reads out loud and types. Grouped, uppercase, unambiguous. */
  function newInviteCode(): string {
    return normalizeInsiderCode(randomBytes(10).toString('hex'));
  }

  async function issueInvite(args: {
    plan: PlanId;
    duration: InsiderDuration;
    note?: string;
  }): Promise<InsiderInvite> {
    const durationDays = INSIDER_TERMS[args.duration].days;
    const code = newInviteCode();
    await client.execute({
      sql: `INSERT INTO insider_invites (code, plan, duration_days, note, created_at_ms)
            VALUES (?, ?, ?, ?, ?)`,
      args: [code, args.plan, durationDays, args.note ?? null, now()],
    });
    return { code, plan: args.plan, duration: args.duration, durationDays };
  }

  /** Every code, newest first: the only way to find one that was mislaid. */
  async function listInvites(limit: number): Promise<InsiderInviteRecord[]> {
    const result = await client.execute({
      sql: `SELECT code, plan, duration_days, note, created_at_ms, redeemed_by, redeemed_at_ms, expires_at_ms
            FROM insider_invites
            ORDER BY created_at_ms DESC, code
            LIMIT ?`,
      args: [limit],
    });
    return result.rows.map((row) => ({
      code: String(row.code),
      plan: String(row.plan) as PlanId,
      duration: insiderDurationForDays(Number(row.duration_days)),
      durationDays: Number(row.duration_days),
      note: row.note == null ? null : String(row.note),
      createdAt: new Date(Number(row.created_at_ms)).toISOString(),
      redeemedBy: row.redeemed_by == null ? null : String(row.redeemed_by),
      redeemedAt: iso(row.redeemed_at_ms),
      endsAt: iso(row.expires_at_ms),
    }));
  }

  /**
   * The code an account's plan stands on: the one it redeemed last.
   *
   * An account can have redeemed several over time (a week to try it, then a
   * year), and only the newest says anything about now. Joining them all, as
   * the sweep once did, let a term that ended months ago clear the plan a
   * later code had granted.
   */
  async function standingInvite(
    accountId: string,
  ): Promise<{ code: string; plan: PlanId; termEndMs: number } | null> {
    const result = await client.execute({
      sql: `SELECT code, plan, expires_at_ms FROM insider_invites
            WHERE redeemed_by = ? AND expires_at_ms IS NOT NULL
            ORDER BY redeemed_at_ms DESC, expires_at_ms DESC
            LIMIT 1`,
      args: [accountId],
    });
    const row = result.rows[0];
    if (!row) return null;
    return {
      code: String(row.code),
      plan: String(row.plan) as PlanId,
      termEndMs: Number(row.expires_at_ms),
    };
  }

  /** When the account's insider plan stops for good, for the app to draw. */
  async function readTermEndMs(accountId: string): Promise<number | null> {
    return (await standingInvite(accountId))?.termEndMs ?? null;
  }

  async function redeemInvite(args: {
    accountId: string;
    code: string;
  }): Promise<InsiderRedeemResult> {
    const atMs = now();
    const code = normalizeInsiderCode(args.code);

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
     *
     * A live insider plan does not: a newer code takes its place, which is
     * what lets a week's trial be followed by a year without waiting the
     * week out.
     */
    const current = await deps.readAccount(args.accountId);
    const subscribed =
      current != null &&
      current.source === 'subscription' &&
      (current.periodEndMs == null || current.periodEndMs > atMs);
    if (subscribed) return { redeemed: false, reason: 'already_subscribed' };

    const durationDays = Number(inviteRow.duration_days);
    const termEndMs = atMs + durationDays * DAY_MS;
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

    try {
      await deps.grantMonthly({
        accountId: args.accountId,
        plan,
        periodEndMs,
        periodStartMs: atMs,
        idempotencyKey: `insider:${code}:period:${periodEndMs}`,
        source: 'insider',
        description: `Insider code ${code}`,
      });
    } catch (error) {
      /*
       * The plan did not land, so the code is handed back. A code is spent
       * once: left claimed, a database that was busy for a moment would have
       * cost somebody the whole of what they were given, with nothing to
       * show for it and no way to try again.
       */
      await client
        .execute({
          sql: `UPDATE insider_invites
                SET redeemed_by = NULL, redeemed_at_ms = NULL, expires_at_ms = NULL
                WHERE code = ? AND redeemed_by = ?`,
          args: [code, args.accountId],
        })
        .catch((releaseError) => {
          console.error(`[Billing] Insider code ${code} could not be handed back:`, releaseError);
        });
      throw error;
    }
    return {
      redeemed: true,
      balance: await deps.readEntitlement(args.accountId),
      plan,
      duration: insiderDurationForDays(durationDays),
      endsAt: new Date(termEndMs).toISOString(),
    };
  }

  /**
   * Carry one account's insider term forward a period, or end it.
   *
   * Insiders have no webhook to renew them - there is no store transaction -
   * so this plays the part one plays for subscriptions. The first period is
   * granted at redemption and each call extends by one period, bounded by the
   * term's end; a term that has run out ends the plan the way an expiration
   * would, balance left for the record.
   *
   * Called from two places: the hourly sweep, and any read of an account
   * whose period has just ended, so nobody waits up to an hour for a month
   * they are owed or keeps a plan an hour past its end.
   */
  async function advanceTerm(accountId: string): Promise<'current' | 'regranted' | 'ended'> {
    const atMs = now();
    const row = await deps.readAccount(accountId);
    if (
      !row ||
      row.source !== 'insider' ||
      row.plan == null ||
      row.periodEndMs == null ||
      row.periodEndMs > atMs
    ) {
      return 'current';
    }

    const invite = await standingInvite(accountId);
    if (!invite || !(invite.plan in CREDIT_PLANS) || row.periodEndMs >= invite.termEndMs) {
      await deps.clearPlan(accountId);
      return 'ended';
    }
    const nextPeriodEndMs = Math.min(row.periodEndMs + INSIDER_PERIOD_MS, invite.termEndMs);
    if (nextPeriodEndMs <= atMs) {
      /*
       * The remaining term is already in the past: nothing looked at this
       * account for long enough that no unexpired period is left to grant.
       * The term ends here rather than granting credits for time that is
       * over - the balance stays for the record, and an account looked at on
       * time never reaches this branch.
       */
      await deps.clearPlan(accountId);
      return 'ended';
    }
    const result = await deps.grantMonthly({
      accountId,
      plan: invite.plan,
      periodEndMs: nextPeriodEndMs,
      idempotencyKey: `insider:${invite.code}:period:${nextPeriodEndMs}`,
      source: 'insider',
      description: `Insider regrant, code ${invite.code}`,
    });
    return result.granted ? 'regranted' : 'current';
  }

  /** Advance every insider account whose period has ended. Returns how many were regranted. */
  async function sweepRegrants(): Promise<number> {
    const due = await client.execute({
      sql: `SELECT account_id FROM account_credits
            WHERE source = 'insider'
              AND plan IS NOT NULL
              AND period_end_ms IS NOT NULL
              AND period_end_ms <= ?`,
      args: [now()],
    });

    let regranted = 0;
    for (const row of due.rows) {
      if ((await advanceTerm(String(row.account_id))) === 'regranted') regranted += 1;
    }
    return regranted;
  }

  return { issueInvite, listInvites, readTermEndMs, redeemInvite, advanceTerm, sweepRegrants };
}
