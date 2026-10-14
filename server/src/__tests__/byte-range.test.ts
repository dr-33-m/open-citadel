import { describe, expect, it } from 'vitest';

import { parseByteRange } from '../byte-range.js';

describe('parseByteRange', () => {
  it('answers the two-byte probe AVPlayer opens with', () => {
    expect(parseByteRange('bytes=0-1', 341_804)).toEqual({ start: 0, end: 1 });
  });

  it('runs an open range to the end of the file', () => {
    expect(parseByteRange('bytes=100-', 1000)).toEqual({ start: 100, end: 999 });
  });

  it('cuts a range that runs past the end at the last byte', () => {
    expect(parseByteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('gives the last bytes for a suffix range', () => {
    expect(parseByteRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 });
    expect(parseByteRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('says when the range starts past the end', () => {
    expect(parseByteRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-0', 1000)).toBe('unsatisfiable');
  });

  it('sends the whole file for no range, or one it does not understand', () => {
    expect(parseByteRange(null, 1000)).toBeNull();
    expect(parseByteRange('bytes=0-1,5-9', 1000)).toBeNull();
    expect(parseByteRange('items=0-1', 1000)).toBeNull();
    expect(parseByteRange('bytes=-', 1000)).toBeNull();
    expect(parseByteRange('bytes=9-2', 1000)).toBeNull();
  });
});
