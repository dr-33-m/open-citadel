import { describe, expect, it } from 'vitest';

import { nextArmed, ROWS_PER_FRAME } from '../armed-rows';

describe('nextArmed', () => {
  it('arms a few more rows each step', () => {
    expect(nextArmed(0, 20)).toBe(ROWS_PER_FRAME);
    expect(nextArmed(ROWS_PER_FRAME, 20)).toBe(ROWS_PER_FRAME * 2);
  });

  it('arms everything once it reaches the end, rows added later included', () => {
    expect(nextArmed(18, 20)).toBe(Infinity);
    expect(nextArmed(0, ROWS_PER_FRAME)).toBe(Infinity);
    expect(nextArmed(0, 0)).toBe(Infinity);
  });
});
