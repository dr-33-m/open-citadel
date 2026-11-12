import { describe, expect, it } from 'vitest';

import {
  THEME_ORDER,
  type Released,
  hubPageOrder,
  librarySideOrder,
  nextRelease,
  releasedThrough,
} from '../theme-order';

describe('who takes a theme when', () => {
  it('gives the hub page in view the first step after the press', () => {
    expect(hubPageOrder(1, 1)).toBe(THEME_ORDER.next);
  });

  it('does the Library before the other pages out of view', () => {
    expect(hubPageOrder(1, 2)).toBeLessThan(hubPageOrder(0, 2));
    expect(hubPageOrder(1, 0)).toBeLessThan(hubPageOrder(2, 0));
  });

  it('gives the other hub pages a later step each', () => {
    const others = [hubPageOrder(0, 1), hubPageOrder(2, 1)];
    expect(new Set(others).size).toBe(2);
    for (const order of others) expect(order).toBeGreaterThan(THEME_ORDER.next);
  });

  it('keeps the side showing with its page, in view or not', () => {
    expect(librarySideOrder(0, true, THEME_ORDER.next)).toBe(THEME_ORDER.next);
    expect(librarySideOrder(0, true, hubPageOrder(1, 2))).toBe(hubPageOrder(1, 2));
  });

  it('puts the sides not showing after every hub page', () => {
    const lastPage = Math.max(hubPageOrder(0, 1), hubPageOrder(2, 1), hubPageOrder(1, 0));
    for (const side of [0, 1, 2]) expect(librarySideOrder(side, false, THEME_ORDER.next)).toBeGreaterThan(lastPage);
  });

  it('has a step for everything it orders', () => {
    const all = [
      ...[0, 1, 2].map((page) => hubPageOrder(page, -1)),
      ...[0, 1, 2].map((side) => librarySideOrder(side, false, 0)),
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(Math.max(...all)).toBe(THEME_ORDER.last);
  });
});

describe('handing a theme out', () => {
  const done: Released = { theme: 'dark', through: THEME_ORDER.last };

  it('has nothing to do while the theme is everywhere', () => {
    expect(releasedThrough(done, 'dark')).toBe(THEME_ORDER.last);
    expect(nextRelease(done, 'dark')).toBeNull();
  });

  it('starts over from the press when a new theme is chosen', () => {
    expect(releasedThrough(done, 'light')).toBe(THEME_ORDER.now);
    expect(nextRelease(done, 'light')).toEqual({ theme: 'light', through: 1 });
  });

  it('goes a step at a time to the last', () => {
    let released = done;
    let steps = 0;
    for (let next = nextRelease(released, 'light'); next; next = nextRelease(released, 'light')) {
      expect(next.through).toBe(releasedThrough(released, 'light') + 1);
      released = next;
      steps += 1;
    }
    expect(steps).toBe(THEME_ORDER.last);
    expect(released).toEqual({ theme: 'light', through: THEME_ORDER.last });
  });

  it('starts over again if the choice is changed back part-way', () => {
    const partWay = { theme: 'light', through: 4 };
    expect(nextRelease(partWay, 'dark')).toEqual({ theme: 'dark', through: 1 });
  });
});
