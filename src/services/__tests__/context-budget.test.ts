import { describe, expect, it } from 'vitest';

import {
  COMPACT_AT_RATIO,
  ContextBudget,
  estimateTokens,
  planReplay,
} from '../context-budget';

// Mirrors the real on-device shape: a 4096 window whose baseline is the system
// prompt plus tool schemas, with room held back for the reply.
const makeBudget = (baseline = 1500) => new ContextBudget(4096, baseline, 768);

describe('estimateTokens', () => {
  it('over-counts rather than under-counts', () => {
    // Under-counting is what lets the KV cache overflow, so the estimate must
    // stay above the naive 4-chars-per-token figure.
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBeGreaterThan(400 / 4);
  });

  it('charges an envelope even for empty content', () => {
    expect(estimateTokens('')).toBeGreaterThan(0);
  });
});

describe('ContextBudget', () => {
  it('starts at the baseline and never resets below it', () => {
    const b = makeBudget();
    expect(b.snapshot().used).toBe(1500);
    b.charge('x'.repeat(1000));
    b.reset();
    expect(b.snapshot().used).toBe(1500);
  });

  it('holds back the reply reserve', () => {
    const b = makeBudget(0);
    expect(b.usable).toBe(4096 - 768);
  });

  it('reports ok while there is room', () => {
    expect(makeBudget().pressure(50)).toBe('ok');
  });

  it('asks for compaction once the ratio is crossed', () => {
    const b = makeBudget();
    b.chargeTokens(Math.ceil(b.usable * COMPACT_AT_RATIO) - 1500);
    expect(b.pressure(10)).toBe('compact');
  });

  it('asks for compaction when the turn does not fit but would after a reset', () => {
    const b = makeBudget();
    b.chargeTokens(1500);
    expect(b.pressure(500)).toBe('compact');
  });

  it('reports full only when a bare conversation could not hold the turn', () => {
    const b = makeBudget();
    // Baseline 1500 + 3000 exceeds the 3328 usable window, so compaction
    // cannot rescue this turn however much history is dropped.
    expect(b.pressure(3000)).toBe('full');
  });

  it('rebases without losing what is already charged', () => {
    const b = makeBudget(1000);
    b.chargeTokens(500);
    b.rebase(1200);
    expect(b.snapshot().used).toBe(1500);
    expect(b.snapshot().baseline).toBe(1200);
  });
});

describe('planReplay', () => {
  const history = [
    { role: 'user' as const, content: 'oldest' },
    { role: 'model' as const, content: 'second' },
    { role: 'user' as const, content: 'third' },
    { role: 'model' as const, content: 'newest' },
  ];

  it('keeps the newest turns and reports what it dropped', () => {
    const plan = planReplay(history, estimateTokens('newest') * 2);
    expect(plan.messages.map((m) => m.content)).toEqual(['third', 'newest']);
    expect(plan.dropped).toBe(2);
  });

  it('returns turns oldest-first so the replay reads in order', () => {
    const plan = planReplay(history, 10_000);
    expect(plan.messages.map((m) => m.content)).toEqual(['oldest', 'second', 'third', 'newest']);
    expect(plan.dropped).toBe(0);
  });

  it('charges the session context first so it always survives', () => {
    const context = 'c'.repeat(2000);
    const plan = planReplay(history, estimateTokens(context) + 2, context);
    expect(plan.messages).toHaveLength(0);
    expect(plan.dropped).toBe(4);
  });

  it('ignores blank turns', () => {
    const plan = planReplay([{ role: 'user', content: '   ' }], 10_000);
    expect(plan.messages).toHaveLength(0);
    expect(plan.dropped).toBe(0);
  });
});
