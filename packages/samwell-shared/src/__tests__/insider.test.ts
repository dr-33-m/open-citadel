import { describe, expect, it } from 'vitest';

import {
  INSIDER_DURATION_ORDER,
  INSIDER_TERMS,
  insiderDurationForDays,
  insiderInviteLabel,
  isCompleteInsiderCode,
  normalizeInsiderCode,
} from '../insider';

describe('insider terms', () => {
  it('names four terms, shortest first', () => {
    expect(INSIDER_DURATION_ORDER.map((id) => INSIDER_TERMS[id].days)).toEqual([1, 7, 30, 365]);
    expect(INSIDER_DURATION_ORDER.map((id) => INSIDER_TERMS[id].label)).toEqual([
      '1 day',
      '1 week',
      '1 month',
      '1 year',
    ]);
  });

  it('finds the term a stored number of days is', () => {
    expect(insiderDurationForDays(365)).toBe('year');
    expect(insiderDurationForDays(7)).toBe('week');
    // A code minted before terms had names.
    expect(insiderDurationForDays(60)).toBeNull();
  });

  it('says a code in one line', () => {
    expect(insiderInviteLabel('maester', 'year')).toBe('1 year · Maester Samwell');
    expect(insiderInviteLabel('archmaester', 'day')).toBe('1 day · Archmaester Samwell');
  });
});

describe('normalizeInsiderCode', () => {
  it('leaves a stored code as it is', () => {
    expect(normalizeInsiderCode('A1B2C-3D4E5-F6A7B-8C9D0')).toBe('A1B2C-3D4E5-F6A7B-8C9D0');
  });

  it('takes a code however it was typed or pasted', () => {
    expect(normalizeInsiderCode('  a1b2c3d4e5f6a7b8c9d0\n')).toBe('A1B2C-3D4E5-F6A7B-8C9D0');
    expect(normalizeInsiderCode('a1b2c 3d4e5 f6a7b 8c9d0')).toBe('A1B2C-3D4E5-F6A7B-8C9D0');
  });

  it('groups a code as it is being typed, with no dash left hanging', () => {
    expect(normalizeInsiderCode('')).toBe('');
    expect(normalizeInsiderCode('a1b')).toBe('A1B');
    expect(normalizeInsiderCode('a1b2c')).toBe('A1B2C');
    expect(normalizeInsiderCode('a1b2c3')).toBe('A1B2C-3');
  });

  it('cuts what runs past a code', () => {
    expect(normalizeInsiderCode('A1B2C-3D4E5-F6A7B-8C9D0-EXTRA')).toBe('A1B2C-3D4E5-F6A7B-8C9D0');
  });
});

describe('isCompleteInsiderCode', () => {
  it('is true only once every character is there', () => {
    expect(isCompleteInsiderCode('A1B2C-3D4E5-F6A7B-8C9D0')).toBe(true);
    expect(isCompleteInsiderCode('a1b2c3d4e5f6a7b8c9d0')).toBe(true);
    expect(isCompleteInsiderCode('A1B2C-3D4E5-F6A7B-8C9D')).toBe(false);
    expect(isCompleteInsiderCode('')).toBe(false);
  });
});
