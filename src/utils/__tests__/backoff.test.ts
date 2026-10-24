import { describe, expect, it } from 'vitest';

import { FIRST_RETRY_MAX_MS, FIRST_RETRY_MIN_MS, MAX_RETRY_WAIT_MS, retryDelayMs } from '../backoff';

describe('retryDelayMs', () => {
  it('waits a jittered half second to a second first', () => {
    expect(retryDelayMs(1, () => 0)).toBe(FIRST_RETRY_MIN_MS);
    expect(retryDelayMs(1, () => 0.999)).toBeLessThan(FIRST_RETRY_MAX_MS);
  });

  it('doubles each time', () => {
    expect(retryDelayMs(2, () => 0)).toBe(FIRST_RETRY_MIN_MS * 2);
    expect(retryDelayMs(3, () => 0)).toBe(FIRST_RETRY_MIN_MS * 4);
  });

  it('stops growing at the ceiling', () => {
    expect(retryDelayMs(20, () => 0.5)).toBe(MAX_RETRY_WAIT_MS);
  });
});
