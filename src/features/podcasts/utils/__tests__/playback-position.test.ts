import { describe, expect, it } from 'vitest';

import { chapterIndexAt, positionSince, type PositionRead } from '@/features/podcasts/utils/playback-position';

const chapters = [{ startSec: 0 }, { startSec: 60 }, { startSec: 300 }];

describe('chapterIndexAt', () => {
  it('finds the chapter a position falls in', () => {
    expect(chapterIndexAt(chapters, 0)).toBe(0);
    expect(chapterIndexAt(chapters, 59)).toBe(0);
    expect(chapterIndexAt(chapters, 61)).toBe(1);
    expect(chapterIndexAt(chapters, 4000)).toBe(2);
  });

  it('counts a chapter as started half a second early', () => {
    expect(chapterIndexAt(chapters, 59.4)).toBe(0);
    expect(chapterIndexAt(chapters, 59.5)).toBe(1);
  });

  it('is -1 before the first chapter and when there are none', () => {
    expect(chapterIndexAt([{ startSec: 30 }], 10)).toBe(-1);
    expect(chapterIndexAt([], 10)).toBe(-1);
  });
});

describe('positionSince', () => {
  const read: PositionRead = { itemId: 'e', position: 100, duration: 600, at: 1_000, rate: 1.5 };

  it('carries on at the playback speed', () => {
    expect(positionSince(read, 3_000)).toBe(103);
  });

  it('stays put while paused', () => {
    expect(positionSince({ ...read, rate: 0 }, 60_000)).toBe(100);
  });

  it('never passes the end of the episode', () => {
    expect(positionSince(read, 10_000_000)).toBe(600);
  });

  it('is not held to an unknown duration, or moved by a clock that went back', () => {
    expect(positionSince({ ...read, duration: 0 }, 3_000)).toBe(103);
    expect(positionSince(read, 0)).toBe(100);
  });
});
