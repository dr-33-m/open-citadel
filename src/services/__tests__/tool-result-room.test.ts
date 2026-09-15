import { describe, expect, it } from 'vitest';

import { estimateTokens } from '../context-budget';
import {
  DEVICE_TOOL_RESULT_FLOOR_TOKENS,
  deviceToolResultBudget,
  TOOL_RESULT_TOKEN_BUDGET,
} from '../tool-limits';

describe('deviceToolResultBudget', () => {
  const envelope = estimateTokens('suggest_next_book');

  it('keeps the full ceiling when the conversation has room', () => {
    expect(deviceToolResultBudget(3000, envelope)).toBe(TOOL_RESULT_TOKEN_BUDGET.device);
  });

  it('keeps the full ceiling when nothing is budgeting', () => {
    expect(deviceToolResultBudget(Number.POSITIVE_INFINITY, envelope)).toBe(
      TOOL_RESULT_TOKEN_BUDGET.device,
    );
  });

  it('shrinks to the room left, as in the chat that hit the banner', () => {
    // Measured at 4K: 3328 usable, 2865 used by the time the tool ran, so 463
    // left against a library list of about 580.
    const budget = deviceToolResultBudget(463, envelope);
    expect(budget).not.toBeNull();
    expect(budget! + envelope).toBeLessThanOrEqual(463);
    expect(budget!).toBeLessThan(TOOL_RESULT_TOKEN_BUDGET.device);
  });

  it('returns null when there is no room for a useful result', () => {
    expect(deviceToolResultBudget(envelope + 20, envelope)).toBeNull();
  });

  it('never offers less than the floor', () => {
    const budget = deviceToolResultBudget(envelope + 16 + DEVICE_TOOL_RESULT_FLOOR_TOKENS, envelope);
    expect(budget).toBe(DEVICE_TOOL_RESULT_FLOOR_TOKENS);
  });
});
