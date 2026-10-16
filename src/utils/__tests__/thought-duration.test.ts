import { describe, expect, it } from 'vitest';

import { thoughtDuration } from '../thought-duration';

describe('thoughtDuration', () => {
  it('says seconds under a minute, minutes and seconds past it', () => {
    expect(thoughtDuration(12)).toBe('12s');
    expect(thoughtDuration(140)).toBe('2m 20s');
    expect(thoughtDuration(120)).toBe('2m');
  });
});
