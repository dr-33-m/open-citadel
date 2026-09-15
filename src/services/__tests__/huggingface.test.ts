import { describe, expect, it } from 'vitest';

import { filterModels, paramsBillions, smallestPlausibleBytes } from '../huggingface';

const repo = (name: string) => ({ id: `litert-community/${name}`, name, downloads: 0, paramsB: paramsBillions(name) });

describe('paramsBillions', () => {
  it('reads a plain parameter count', () => {
    expect(paramsBillions('Qwen3-14B')).toBe(14);
    expect(paramsBillions('Qwen3-0.6B')).toBe(0.6);
  });

  it('takes the total, not the active count, for a mixture of experts', () => {
    // 26B total with 4B active still has to be held in memory in full.
    expect(paramsBillions('gemma-4-26B-A4B-it-litert-lm')).toBe(26);
  });

  it("reads Gemma's effective-parameter naming", () => {
    // E2B is "effective 2B", so 2 is the right reading and the resulting
    // floor is low enough that the exact file size still decides.
    expect(paramsBillions('gemma-4-E2B-it-litert-lm')).toBe(2);
  });

  it('ignores a version number that is not a parameter count', () => {
    // The B has to follow the number: LFM2.5 is a version, 1.2B is the size.
    expect(paramsBillions('LFM2.5-1.2B-Instruct')).toBe(1.2);
    expect(paramsBillions('Qwen2.5-1.5B-Instruct')).toBe(1.5);
  });

  it('returns null when the name states no size', () => {
    expect(paramsBillions('SmolLM2-360M-Instruct')).toBeNull();
    expect(paramsBillions('Jan-nano')).toBeNull();
  });
});

describe('smallestPlausibleBytes', () => {
  it('is optimistic, so it only rules out the impossible', () => {
    // ~0.5 bytes/param is aggressive 4-bit; a real 14B build is far larger.
    expect(smallestPlausibleBytes(14)).toBe(Math.round(7 * 1024 ** 3));
  });

  it('passes through an unknown size', () => {
    expect(smallestPlausibleBytes(null)).toBeNull();
  });
});

describe('filterModels', () => {
  const repos = [repo('Qwen3-0.6B'), repo('gemma-4-E2B-it-litert-lm'), repo('SmolLM2-360M-Instruct')];

  it('returns everything for an empty query', () => {
    expect(filterModels(repos, '   ')).toHaveLength(3);
  });

  it('matches on name, case-insensitively', () => {
    expect(filterModels(repos, 'qwen').map((r) => r.name)).toEqual(['Qwen3-0.6B']);
  });
});
