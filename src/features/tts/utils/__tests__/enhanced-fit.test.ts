import { describe, expect, it } from 'vitest';

import { enhancedFit, enhancedFitCopy, enhancedSmoothBytes, smootherBox } from '../enhanced-fit';

const KB = 1024;
// MemTotal from the phones themselves: the Galaxy A33 (sold as 6 GB) and the 8 GB emulator.
const A33 = 5_518_140 * KB;
const EIGHT_GB = 8_135_972 * KB;
// A phone sold as 4 GB.
const FOUR_GB = 3_750_000 * KB;
const BOXES = ['paradee', 'supertonic', 'kokoro'] as const;

describe('enhancedFit', () => {
  it('warns about Kokoro and Supertonic on the Galaxy A33 their bar was measured on', () => {
    expect(enhancedFit(A33, 'kokoro')).toBe('strained');
    expect(enhancedFit(A33, 'supertonic')).toBe('strained');
  });

  it('clears Paradee on the Galaxy A33, where it kept up', () => {
    expect(enhancedFit(A33, 'paradee')).toBe('smooth');
  });

  it('warns about Paradee below the smallest phone it was measured on', () => {
    expect(enhancedFit(FOUR_GB, 'paradee')).toBe('strained');
  });

  it('clears every voice box on a phone sold as 8 GB', () => {
    for (const box of BOXES) expect(enhancedFit(EIGHT_GB, box)).toBe('smooth');
  });

  it('draws the line at the bar itself', () => {
    for (const box of BOXES) {
      expect(enhancedFit(enhancedSmoothBytes(box), box)).toBe('smooth');
      expect(enhancedFit(enhancedSmoothBytes(box) - 1, box)).toBe('strained');
    }
  });

  it('does not warn over a missing number', () => {
    expect(enhancedFit(null, 'kokoro')).toBe('smooth');
    expect(enhancedFit(undefined, 'kokoro')).toBe('smooth');
    expect(enhancedFit(0, 'kokoro')).toBe('smooth');
  });
});

describe('smootherBox', () => {
  it('points a straining Galaxy A33 at Paradee', () => {
    expect(smootherBox(A33, 'kokoro', BOXES)).toBe('paradee');
    expect(smootherBox(A33, 'supertonic', BOXES)).toBe('paradee');
  });

  it('never points at the voice box asked about', () => {
    expect(smootherBox(A33, 'paradee', BOXES)).toBeNull();
  });

  it('points nowhere when nothing offered runs smoothly, or there is nothing to judge with', () => {
    expect(smootherBox(FOUR_GB, 'kokoro', BOXES)).toBeNull();
    expect(smootherBox(A33, 'kokoro', ['supertonic', 'kokoro'])).toBeNull();
    expect(smootherBox(null, 'kokoro', BOXES)).toBeNull();
  });
});

describe('enhancedFitCopy', () => {
  it('names the voice box it is about', () => {
    expect(enhancedFitCopy('smooth', 'paradee').title).toMatch(/Paradee/);
    expect(enhancedFitCopy('strained', 'kokoro').title).toMatch(/Kokoro/);
    expect(enhancedFitCopy('strained', 'kokoro').line).toMatch(/8 GB/);
    expect(enhancedFitCopy('strained', 'paradee').line).toMatch(/6 GB/);
  });

  it('gives advice only when there is something to do', () => {
    expect(enhancedFitCopy('smooth', 'kokoro').advice).toBeNull();
    expect(enhancedFitCopy('strained', 'kokoro').advice).toMatch(/Lite voices/);
    expect(enhancedFitCopy('strained', 'kokoro').advice).toMatch(/Cloud/);
    expect(enhancedFitCopy('strained', 'kokoro').advice).not.toMatch(/coming soon/i);
  });

  it('advises Cloud first, then the ways to stay on the phone', () => {
    for (const smoother of ['paradee', null] as const) {
      const advice = enhancedFitCopy('strained', 'kokoro', smoother).advice ?? '';
      expect(advice).toMatch(/^For the best voices, try Cloud/);
      expect(advice.indexOf('Cloud')).toBeLessThan(advice.indexOf('Lite voices'));
    }
  });

  it('names the voice box that does run smoothly, when there is one', () => {
    expect(enhancedFitCopy('strained', 'kokoro', 'paradee').advice).toMatch(/use Paradee or Lite voices/);
    expect(enhancedFitCopy('strained', 'kokoro').advice).not.toMatch(/Paradee/);
  });

  it('never sets Cloud against what it costs', () => {
    for (const smoother of ['paradee', null] as const) {
      const copy = enhancedFitCopy('strained', 'kokoro', smoother);
      expect(`${copy.title} ${copy.line} ${copy.advice}`).not.toMatch(/pay|afford|money|cost|free|cheap|price/i);
    }
  });

  it('says what straining is like, not that the voice pauses', () => {
    const copy = enhancedFitCopy('strained', 'supertonic');
    expect(copy.title).toBe('Supertonic may be slow on your phone');
    expect(copy.line).toMatch(/silences between sentences/);
    expect(`${copy.title} ${copy.line}`).not.toMatch(/pause/i);
  });

  it('says the same thing on the mark as on the sheet it opens', () => {
    expect(enhancedFitCopy('strained', 'kokoro').mark).toBe('May be slow on your phone');
    expect(enhancedFitCopy('strained', 'kokoro').title).toBe('Kokoro may be slow on your phone');
    expect(enhancedFitCopy('smooth', 'paradee').mark).toBe('Runs smoothly on your phone');
    expect(enhancedFitCopy('smooth', 'paradee').title).toBe('Your phone runs Paradee smoothly');
  });

  it('stays short: a line and an advice of two sentences each at most', () => {
    for (const box of BOXES) {
      const copy = enhancedFitCopy('strained', box, 'paradee');
      expect(copy.line.length).toBeLessThanOrEqual(90);
      expect((copy.advice ?? '').length).toBeLessThanOrEqual(90);
    }
  });

  it('never uses an em dash', () => {
    for (const fit of ['smooth', 'strained'] as const) {
      for (const box of BOXES) {
        const copy = enhancedFitCopy(fit, box, 'paradee');
        expect(`${copy.mark}${copy.title}${copy.line}${copy.advice ?? ''}`).not.toMatch(/—/);
      }
    }
  });
});
