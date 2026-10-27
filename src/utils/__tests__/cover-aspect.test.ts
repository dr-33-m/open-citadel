import { describe, expect, it } from 'vitest';

import { coverAspect } from '@/utils/cover-aspect';

describe('coverAspect', () => {
  it('stands a book up and keeps a post square', () => {
    expect(coverAspect(false)).toBeCloseTo(2 / 3);
    expect(coverAspect(true)).toBe(1);
  });
});
