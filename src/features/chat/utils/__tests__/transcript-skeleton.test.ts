import { describe, expect, it } from 'vitest';

import { skeletonExchanges } from '@/features/chat/utils/transcript-skeleton';

describe('skeletonExchanges', () => {
  it('stacks enough to cover the screen, and one more', () => {
    expect(skeletonExchanges(800)).toHaveLength(Math.ceil(800 / 168) + 1);
  });

  it('covers a taller screen with more', () => {
    expect(skeletonExchanges(1000).length).toBeGreaterThan(skeletonExchanges(600).length);
  });

  it('always draws at least one', () => {
    expect(skeletonExchanges(0)).toHaveLength(1);
  });
});
