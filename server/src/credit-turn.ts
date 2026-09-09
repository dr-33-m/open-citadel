/**
 * How much of their own balance one message may spend.
 *
 * The sibling of `tool-loop.ts`, and its reason for existing is the same
 * runaway measured on real traffic: eleven per cent of turns were ninety-one
 * per cent of all spend. The loop ceiling bounds how many round trips a turn
 * may take; this bounds how much a turn may COST, which the loop ceiling
 * alone does not - a dozen round trips against a frontier model with a
 * conversation growing between each is expensive in a way counting calls
 * never notices.
 *
 * The shape is deliberately the same: a pure, injectable store, a decision
 * made in one function, a sweep that drops what nothing has touched. The
 * store is in memory and single-process by assumption, and the failure mode
 * if that stops being true is lenient - a turn whose spend lands on two
 * instances looks cheaper than it was and gets more rope, while the balance
 * itself (atomic, in the ledger) stays the hard stop.
 *
 * What crossing the ceiling means: the settle that pushes a turn's total past
 * its ceiling is billed (the actual is authoritative) and carries a note in
 * the ledger saying it crossed; every further request in that turn is
 * refused. So a turn can breach by at most one request's worth of tokens,
 * and the breach is visible rather than silent.
 */
import { TOOL_LOOP_WINDOW_MS } from 'samwell-shared';

/**
 * The share of the remaining balance one turn may consume.
 *
 * Half. A reader should never be more than one message away from a working
 * balance whatever they do, and the turns this exists for are the ones nobody
 * chose - the loop ceiling stops ordinary accidents long before this moves.
 */
export const TURN_CREDIT_SHARE = 0.5;

export interface TurnSpend {
  /** Actual credits settled so far in this turn. */
  spent: number;
  lastSeenMs: number;
  /** Whether the crossing has already been noted in the ledger. */
  noted: boolean;
}

export type TurnSpendStore = Map<string, TurnSpend>;

export type TurnCreditDecision =
  | { allowed: true; ceiling: number }
  | { allowed: false; spent: number; ceiling: number };

/**
 * Decide whether this request may proceed, given what the turn already spent.
 *
 * `required` is this request's own estimate and the ceiling is a share of
 * what is available RIGHT NOW, so the bound tightens as the turn spends -
 * which is the point: a turn eating the balance meets its ceiling sooner,
 * not later.
 *
 * A reader speaking again resets the turn, exactly as the loop ceiling does:
 * their new message is a fresh decision.
 */
export function admitTurnSpend(
  store: TurnSpendStore,
  key: string,
  isNewUserTurn: boolean,
  required: number,
  available: number,
  nowMs: number,
  share: number = TURN_CREDIT_SHARE,
): TurnCreditDecision {
  const ceiling = Math.floor(share * Math.max(0, available));

  if (isNewUserTurn || !store.has(key)) {
    store.set(key, { spent: 0, lastSeenMs: nowMs, noted: false });
    if (required > ceiling) {
      /*
       * The first request alone does not fit. This is the balance gate's
       * verdict restated, not a breach: nothing has been spent yet, so there
       * is nothing to note in the ledger. The reserve step below refuses it
       * properly.
       */
      return { allowed: false, spent: 0, ceiling };
    }
    return { allowed: true, ceiling };
  }

  const existing = store.get(key)!;
  const spent = existing.spent;
  if (spent + required > ceiling) {
    store.set(key, { ...existing, lastSeenMs: nowMs });
    return { allowed: false, spent, ceiling };
  }
  store.set(key, { ...existing, lastSeenMs: nowMs });
  return { allowed: true, ceiling };
}

/**
 * Record what a settle actually cost, and say whether it crossed the ceiling.
 *
 * `crossed` is the one moment the ledger note is due: the actual is
 * authoritative and is charged either way, but the row that pushed the turn
 * past its bound carries the description saying so. Once noted, a turn is
 * not noted again.
 */
export function recordTurnSpend(
  store: TurnSpendStore,
  key: string,
  actual: number,
  ceiling: number,
  nowMs: number,
): { total: number; crossed: boolean } {
  const existing = store.get(key) ?? { spent: 0, lastSeenMs: nowMs, noted: false };
  const total = existing.spent + Math.max(0, actual);
  const crossed = !existing.noted && total > ceiling;
  store.set(key, { spent: total, lastSeenMs: nowMs, noted: existing.noted || crossed });
  return { total, crossed };
}

/** Drop turns nothing has touched, on the same idleness rule as the loop. */
export function sweepTurnSpends(store: TurnSpendStore, nowMs: number): number {
  let dropped = 0;
  for (const [key, spend] of store) {
    if (nowMs - spend.lastSeenMs > TOOL_LOOP_WINDOW_MS) {
      store.delete(key);
      dropped += 1;
    }
  }
  return dropped;
}
