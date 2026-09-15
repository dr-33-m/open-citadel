import { describe, expect, it } from 'vitest';

import {
  countableProgress,
  didReadOn,
  MAX_READING_STEP,
  READ_DAY_FULL,
  READ_DAY_MIN,
  readingDotStrength,
} from '../reading-day';

describe('countableProgress', () => {
  it('counts ordinary forward reading', () => {
    expect(countableProgress(0.1, 0.104)).toBeCloseTo(0.004);
  });

  it('ignores a position that did not move', () => {
    expect(countableProgress(0.42, 0.42)).toBe(0);
  });

  it('ignores backwards movement rather than subtracting it', () => {
    // Scrubbing back to re-read must never claw back the day's earned progress.
    expect(countableProgress(0.5, 0.3)).toBe(0);
  });

  it('ignores a jump too large to be reading', () => {
    // A table-of-contents tap to the last chapter.
    expect(countableProgress(0.1, 0.9)).toBe(0);
  });

  it('counts a step right at the plausible-reading ceiling', () => {
    expect(countableProgress(0, MAX_READING_STEP)).toBeCloseTo(MAX_READING_STEP);
  });

  it('rejects a step just past the ceiling', () => {
    expect(countableProgress(0, MAX_READING_STEP + 0.001)).toBe(0);
  });

  it('is safe against non-finite progress from the reader', () => {
    expect(countableProgress(0, Number.NaN)).toBe(0);
  });
});

describe('didReadOn', () => {
  it('does not credit a stray page turn', () => {
    expect(didReadOn(0.001)).toBe(false);
  });

  it('credits a genuine sitting', () => {
    expect(didReadOn(0.03)).toBe(true);
  });

  it('credits a day exactly at the threshold', () => {
    expect(didReadOn(READ_DAY_MIN)).toBe(true);
  });

  it('credits reading split across two books', () => {
    // Each book alone would fall short; together they are a real day.
    expect(didReadOn(0.003 + 0.004)).toBe(true);
  });
});

describe('readingDotStrength', () => {
  it('never fades a real day below 0.2', () => {
    expect(readingDotStrength(READ_DAY_MIN)).toBe(0.2);
  });

  it('reaches full strength at a solid day', () => {
    expect(readingDotStrength(READ_DAY_FULL)).toBe(1);
  });

  it('does not exceed full strength on a long day', () => {
    expect(readingDotStrength(0.9)).toBe(1);
  });

  it('renders a no-reading day at full strength in its own colour', () => {
    expect(readingDotStrength(0)).toBe(1);
  });
});
