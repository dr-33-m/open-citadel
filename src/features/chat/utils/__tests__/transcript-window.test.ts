import { describe, expect, it } from 'vitest';

import { pageStart } from '@/features/chat/utils/transcript-window';

const turns = (...lengths: number[]) => lengths.map((n) => ({ content: 'x'.repeat(n) }));

describe('pageStart', () => {
  it('draws a short conversation whole', () => {
    expect(pageStart(turns(100, 200, 300), 3, 1_600)).toBe(0);
  });

  it('takes turns from the end until the page holds enough text', () => {
    // 700 + 500 + 600 = 1,800 reaches 1,600 at the third from the end.
    expect(pageStart(turns(900, 400, 600, 500, 700), 5, 1_600)).toBe(2);
  });

  it('always draws at least one turn, however long it is', () => {
    expect(pageStart(turns(100, 5_000), 2, 1_600)).toBe(1);
  });

  it('pages backwards from where the drawn turns begin', () => {
    expect(pageStart(turns(900, 400, 600, 500, 700), 2, 1_000)).toBe(0);
  });

  it('stops at the start', () => {
    expect(pageStart(turns(50), 0, 1_600)).toBe(0);
  });
});
