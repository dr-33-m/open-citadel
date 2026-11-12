import { afterEach, describe, expect, it, vi } from 'vitest';

import { holdForSheet, whenSheetsClosed } from '@/lib/sheets-closing';

afterEach(() => vi.useRealTimers());

describe('whenSheetsClosed', () => {
  it('runs at once when no sheet is on screen', () => {
    const fn = vi.fn();
    whenSheetsClosed(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('waits for every sheet to have closed', () => {
    const first = holdForSheet();
    const second = holdForSheet();
    const fn = vi.fn();
    whenSheetsClosed(fn);
    first();
    expect(fn).not.toHaveBeenCalled();
    second();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('counts a release once, however often it is called', () => {
    const first = holdForSheet();
    const second = holdForSheet();
    const fn = vi.fn();
    whenSheetsClosed(fn);
    first();
    first();
    expect(fn).not.toHaveBeenCalled();
    second();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('never waits for good on a sheet left open', () => {
    vi.useFakeTimers();
    const release = holdForSheet();
    const fn = vi.fn();
    whenSheetsClosed(fn);
    vi.advanceTimersByTime(600);
    expect(fn).toHaveBeenCalledTimes(1);
    release();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
