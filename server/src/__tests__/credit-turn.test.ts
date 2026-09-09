import { describe, expect, it } from 'vitest';

import {
  TURN_CREDIT_SHARE,
  admitTurnSpend,
  recordTurnSpend,
  sweepTurnSpends,
  type TurnSpendStore,
} from '../credit-turn.js';
import { TOOL_LOOP_WINDOW_MS } from 'samwell-shared';

const KEY = 'account:reader::thread-1';

describe('the per-turn credit ceiling', () => {
  it('lets a turn spend up to its share of what is left', () => {
    const store: TurnSpendStore = new Map();
    const first = admitTurnSpend(store, KEY, true, 200, 1_000, 0);
    expect(first).toEqual({ allowed: true, ceiling: 500 });
    expect(recordTurnSpend(store, KEY, 200, first.ceiling, 100)).toEqual({
      total: 200,
      crossed: false,
    });
  });

  it('refuses the request that would push a turn past the share', () => {
    const store: TurnSpendStore = new Map();
    const first = admitTurnSpend(store, KEY, true, 200, 1_000, 0);
    recordTurnSpend(store, KEY, 200, first.ceiling, 100);
    // 200 spent, 800 left: the ceiling has tightened to 400, and 200 more
    // fits it exactly, while 201 would push the turn past it.
    expect(admitTurnSpend(store, KEY, false, 200, 800, 200)).toMatchObject({ allowed: true });
    expect(admitTurnSpend(store, KEY, false, 201, 800, 300)).toMatchObject({
      allowed: false,
      spent: 200,
      ceiling: 400,
    });
  });

  it('tightens as the balance shrinks, which is the point', () => {
    // The ceiling is a share of what is available RIGHT NOW, not of what was
    // available when the turn began: a turn eating the balance meets its
    // ceiling sooner, not later.
    const store: TurnSpendStore = new Map();
    const first = admitTurnSpend(store, KEY, true, 100, 1_000, 0);
    expect(first.ceiling).toBe(500);
    recordTurnSpend(store, KEY, 100, first.ceiling, 100);
    const second = admitTurnSpend(store, KEY, false, 100, 900, 200);
    expect(second.ceiling).toBe(450);
    recordTurnSpend(store, KEY, 100, second.ceiling, 300);
    const third = admitTurnSpend(store, KEY, false, 100, 800, 400);
    expect(third.ceiling).toBe(400);
  });

  it('starts fresh when the reader speaks again', () => {
    const store: TurnSpendStore = new Map();
    const first = admitTurnSpend(store, KEY, true, 200, 1_000, 0);
    recordTurnSpend(store, KEY, 400, first.ceiling, 100);
    expect(admitTurnSpend(store, KEY, true, 200, 600, 200)).toMatchObject({ allowed: true });
    expect(store.get(KEY)?.spent).toBe(0);
  });

  it('notes the crossing once, on the settle that crossed', () => {
    const store: TurnSpendStore = new Map();
    const first = admitTurnSpend(store, KEY, true, 100, 1_000, 0);
    recordTurnSpend(store, KEY, 400, first.ceiling, 100);
    // 400 of 500: not yet over.
    expect(recordTurnSpend(store, KEY, 50, first.ceiling, 200)).toEqual({
      total: 450,
      crossed: false,
    });
    // 450 + 60 crosses 500, once.
    expect(recordTurnSpend(store, KEY, 60, first.ceiling, 300)).toEqual({
      total: 510,
      crossed: true,
    });
    // And never again - the next settle of the same turn is billed normally.
    expect(recordTurnSpend(store, KEY, 10, first.ceiling, 400)).toEqual({
      total: 520,
      crossed: false,
    });
  });

  it('refuses nothing before anything has been spent - the reserve gate owns that', () => {
    // A first request that does not fit the ceiling is the balance gate's
    // verdict, not a breach: nothing has been spent, so there is no note to
    // write and no turn to blame.
    const store: TurnSpendStore = new Map();
    expect(admitTurnSpend(store, KEY, true, 900, 1_000, 0)).toEqual({
      allowed: false,
      spent: 0,
      ceiling: 500,
    });
    // A fresh turn on the same key still starts at zero, not at the refusal.
    expect(admitTurnSpend(store, KEY, true, 400, 1_000, 100)).toMatchObject({ allowed: true });
  });

  it('sweeps turns nothing has touched, on the same idleness rule as the loop', () => {
    const store: TurnSpendStore = new Map();
    admitTurnSpend(store, KEY, true, 10, 1_000, 0);
    admitTurnSpend(store, 'account:reader::live', true, 10, 1_000, TOOL_LOOP_WINDOW_MS);
    expect(sweepTurnSpends(store, TOOL_LOOP_WINDOW_MS + 1)).toBe(1);
    expect(store.has('account:reader::live')).toBe(true);
  });

  it('floors the ceiling at zero against an empty balance', () => {
    const store: TurnSpendStore = new Map();
    expect(admitTurnSpend(store, KEY, true, 1, 0, 0)).toMatchObject({ allowed: false, ceiling: 0 });
  });

  it('keeps the share a constant the tests can name', () => {
    // Half. Written down once so the ceiling of a 10,000 credit balance is
    // checkable by eye: no turn may take more than 5,000.
    expect(TURN_CREDIT_SHARE).toBe(0.5);
  });
});
