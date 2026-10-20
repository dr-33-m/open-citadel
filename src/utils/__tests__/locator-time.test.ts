import { describe, expect, it } from 'vitest';

import { locatorSeconds } from '@/utils/locator-time';

describe('locatorSeconds', () => {
  it('reads the media fragment', () => {
    expect(locatorSeconds({ locations: { fragments: ['s4', 't=754.2'] } })).toBe(754.2);
  });

  it("is null for a book's locator", () => {
    expect(locatorSeconds({ locations: { progression: 0.3 } } as never)).toBeNull();
    expect(locatorSeconds(null)).toBeNull();
  });
});
