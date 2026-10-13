/**
 * Charging for read-aloud, a sentence at a time, without rounding each one up.
 *
 * Chat rounds a turn up to the next whole credit (`costToCredits`), and for a
 * turn that is fair: one turn, one rounding. Read-aloud is hundreds of small
 * requests a chapter, most of them worth a fraction of a credit, and rounding
 * each one up would charge a Kokoro chapter about ten times what it cost.
 *
 * So each account carries a running remainder: what it has spent on voices
 * that has not yet added up to a whole credit, in integer nano-dollars so the
 * sums are exact. A settle adds its real cost to it, and whole credits are
 * taken off it and debited through the ordinary `settleCredits`, which keeps
 * the ledger the single record of every credit that moved. At any moment an
 * account has been charged its real spend to within one credit.
 *
 * ## Why the claim is its own statement
 *
 * Two pieces can settle at once (the app fetches up to two ahead). Each adds
 * its cost and reads the new remainder back, and each could see the same
 * whole credit in it. The claim is a conditional UPDATE that only succeeds
 * while the remainder still holds the credits being taken, so a credit can be
 * taken once; a settle whose claim finds too little asks for one fewer until
 * one fits or none is left. Single statements throughout, for the reasons
 * `billing.ts` gives: libsql does not wait on concurrent transactions, it
 * throws.
 *
 * Every window between the statements closes towards the reader: a crash
 * after the claim and before the debit loses those credits from the
 * remainder without charging them, which costs the house a fraction of a
 * cent and never costs a reader anything twice.
 */
import type { Client } from '@libsql/client';

import { CREDIT_PLANS, creditValueUsd, type PlanId } from 'samwell-shared';

import { billing as productionBilling, type BillingService } from './billing.js';
import { db } from './db.js';

const NANO_PER_USD = 1_000_000_000;

/** Dollars to whole nano-dollars. Negative or nonsense costs count as nothing. */
export function usdToNano(costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
  return Math.round(costUsd * NANO_PER_USD);
}

/** One credit on this plan, in nano-dollars. Derived, as every credit value is. */
export function creditNano(plan: PlanId): number {
  return Math.round(creditValueUsd(CREDIT_PLANS[plan]) * NANO_PER_USD);
}

export interface SettleSpeechArgs {
  usageEventId: string;
  accountId: string;
  /** The plan the piece was spoken on, whose credit value it is charged at. */
  plan: PlanId;
  /** The real cost: OpenRouter's own figure, or the listed price as a fallback. */
  costUsd: number;
  description?: string;
}

export interface SpeechCharging {
  settleSpeech(args: SettleSpeechArgs): Promise<{ settled: boolean; debited: number }>;
  /** The remainder, for tests and for `/health`-style questions. */
  pendingNano(accountId: string): Promise<number>;
}

export function createSpeechCharging(options: {
  client: Client;
  billing: BillingService;
  now?: () => number;
}): SpeechCharging {
  const { client, billing } = options;
  const now = options.now ?? (() => Date.now());

  async function settleSpeech(args: SettleSpeechArgs): Promise<{ settled: boolean; debited: number }> {
    const cost = usdToNano(args.costUsd);
    const unit = creditNano(args.plan);
    const atMs = now();

    const added = await client.execute({
      sql: `INSERT INTO tts_spend (account_id, pending_nanousd, updated_at_ms)
            VALUES (?, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET
              pending_nanousd = tts_spend.pending_nanousd + excluded.pending_nanousd,
              updated_at_ms = excluded.updated_at_ms
            RETURNING pending_nanousd`,
      args: [args.accountId, cost, atMs],
    });
    // RETURNING reports rowsAffected as 0 on libsql; the row is the answer.
    const pending = Number(added.rows[0]?.pending_nanousd ?? 0);

    /*
     * Largest first, then one fewer each time a claim finds too little. A
     * settle racing this one may have taken some of what this one saw, but
     * not necessarily all: with 1.5 credits seen here and 2.1 seen there, the
     * other takes two and this one finds 0.1 and takes none; the other way
     * round, this takes one, the other's two fails and its one succeeds.
     * Stopping at the first failure would leave a whole credit on the
     * remainder, still owed but past the one-credit promise.
     */
    let claimed = 0;
    const whole = unit > 0 ? Math.floor(pending / unit) : 0;
    for (let attempt = whole; attempt > 0; attempt--) {
      const take = attempt * unit;
      const claim = await client.execute({
        sql: `UPDATE tts_spend SET pending_nanousd = pending_nanousd - ?, updated_at_ms = ?
              WHERE account_id = ? AND pending_nanousd >= ?`,
        args: [take, atMs, args.accountId, take],
      });
      // No RETURNING here, so `rowsAffected` is honest.
      if (claim.rowsAffected > 0) {
        claimed = attempt;
        break;
      }
    }

    const settle = await billing.settleCredits({
      usageEventId: args.usageEventId,
      actualCredits: claimed,
      usage: { costUsd: args.costUsd },
      description: args.description,
      omitZeroLedgerRow: true,
    });

    if (!settle.settled && claimed > 0) {
      /*
       * The event was already closed (swept, or settled by a retry), so the
       * debit did not happen. The credits go back on the remainder rather
       * than vanishing: they are still spend that has not been charged.
       */
      await client.execute({
        sql: `UPDATE tts_spend SET pending_nanousd = pending_nanousd + ?, updated_at_ms = ?
              WHERE account_id = ?`,
        args: [claimed * unit, atMs, args.accountId],
      });
      return { settled: false, debited: 0 };
    }
    return { settled: settle.settled, debited: settle.settled ? claimed : 0 };
  }

  async function pendingNano(accountId: string): Promise<number> {
    const result = await client.execute({
      sql: 'SELECT pending_nanousd FROM tts_spend WHERE account_id = ?',
      args: [accountId],
    });
    return Number(result.rows[0]?.pending_nanousd ?? 0);
  }

  return { settleSpeech, pendingNano };
}

export const speechCharging = createSpeechCharging({ client: db, billing: productionBilling });
