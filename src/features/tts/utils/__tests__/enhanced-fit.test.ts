import { describe, expect, it } from 'vitest';

import { ENHANCED_SMOOTH_BYTES, enhancedFit, enhancedFitCopy } from '../enhanced-fit';

const KB = 1024;

describe('enhancedFit', () => {
  it('warns on the Galaxy A33 the bar was measured on', () => {
    // MemTotal from the phone itself: sold as 6 GB.
    expect(enhancedFit(5_518_140 * KB)).toBe('strained');
  });

  it('clears a phone sold as 8 GB', () => {
    // MemTotal from the 8 GB emulator.
    expect(enhancedFit(8_135_972 * KB)).toBe('smooth');
  });

  it('draws the line at the bar itself', () => {
    expect(enhancedFit(ENHANCED_SMOOTH_BYTES)).toBe('smooth');
    expect(enhancedFit(ENHANCED_SMOOTH_BYTES - 1)).toBe('strained');
  });

  it('does not warn over a missing number', () => {
    expect(enhancedFit(null)).toBe('smooth');
    expect(enhancedFit(undefined)).toBe('smooth');
    expect(enhancedFit(0)).toBe('smooth');
  });
});

describe('enhancedFitCopy', () => {
  it('gives advice only when there is something to do', () => {
    expect(enhancedFitCopy('smooth').advice).toBeNull();
    expect(enhancedFitCopy('strained').advice).toMatch(/Lite voices/);
    // The phone that strains is the one Cloud Kokoro is for.
    expect(enhancedFitCopy('strained').advice).toMatch(/Cloud/);
    expect(enhancedFitCopy('strained').advice).not.toMatch(/coming soon/i);
  });

  it('never uses an em dash', () => {
    for (const fit of ['smooth', 'strained'] as const) {
      const copy = enhancedFitCopy(fit);
      expect(`${copy.mark}${copy.title}${copy.line}${copy.advice ?? ''}`).not.toMatch(/—/);
    }
  });
});
