import { describe, expect, it } from 'vitest';

import {
  COMPACT_AT_RATIO,
  contextPressure,
  estimateTokens,
  planReplay,
  remainingTokens,
  replayTokenBudget,
  replyReserveTokens,
  usableTokens,
} from '../context-budget';

describe('estimateTokens', () => {
  it('over-counts rather than under-counts', () => {
    // Under-counting is what lets a turn run past the window, so the estimate
    // must stay above the naive 4-chars-per-token figure.
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBeGreaterThan(400 / 4);
  });

  it('charges an envelope even for empty content', () => {
    expect(estimateTokens('')).toBeGreaterThan(0);
  });
});

describe('replyReserveTokens', () => {
  it('holds back 768 in a 4K window', () => {
    expect(replyReserveTokens(4048)).toBe(768);
  });

  it('holds back a quarter of a 2K window, not 768', () => {
    // A flat 768 left a 2K window about 400 tokens of conversation once the
    // system prompt was in.
    expect(replyReserveTokens(2048)).toBe(512);
    expect(usableTokens(2048)).toBe(1536);
  });
});

describe('contextPressure', () => {
  // Mirrors Gemma 4 E2B: a 4048 window whose baseline is the compact prompt
  // plus the device tool schemas.
  const snap = (used: number, baseline = 1500) => ({ used, max: 4048, baseline });

  it('reports ok while there is room', () => {
    expect(contextPressure(snap(1500), 50)).toBe('ok');
  });

  it('asks for compaction once the ratio is crossed', () => {
    const used = Math.ceil(usableTokens(4048) * COMPACT_AT_RATIO);
    expect(contextPressure(snap(used), 10)).toBe('compact');
  });

  it('asks for compaction when the turn does not fit but would after a reset', () => {
    expect(contextPressure(snap(2000), 1500)).toBe('compact');
  });

  it('reports full only when a bare conversation could not hold the turn', () => {
    // Baseline 1500 + 2000 exceeds the 3280 usable window, so compaction
    // cannot rescue this turn however much history is dropped.
    expect(contextPressure(snap(1500), 2000)).toBe('full');
  });

  it('counts room from the exact position, not from the baseline', () => {
    expect(remainingTokens(snap(3000))).toBe(usableTokens(4048) - 3000);
    expect(remainingTokens(snap(4000))).toBe(0);
  });

  it('replays into most of what the baseline leaves, and never below zero', () => {
    expect(replayTokenBudget(snap(0, 1000))).toBe(Math.floor((usableTokens(4048) - 1000) * 0.6));
    expect(replayTokenBudget(snap(0, 4000))).toBe(0);
  });
});

describe('planReplay', () => {
  const history = [
    { role: 'user' as const, content: 'oldest' },
    { role: 'assistant' as const, content: 'second' },
    { role: 'user' as const, content: 'third' },
    { role: 'assistant' as const, content: 'newest' },
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
