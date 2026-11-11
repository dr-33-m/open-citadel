import { describe, expect, it } from 'vitest';

import { PERFORMANCE_INFO, performanceLine } from '@/features/settings/utils/performance-sharing';

describe('performanceLine', () => {
  it('recommends while off and thanks while on, short enough to sit beside a switch', () => {
    expect(performanceLine(false)).toBe('Recommended');
    expect(performanceLine(true)).toBe('Helping make it faster');
    for (const line of [performanceLine(false), performanceLine(true)]) expect(line.length).toBeLessThanOrEqual(24);
  });
});

describe('PERFORMANCE_INFO', () => {
  it('does not round what is sent up to "anonymous", and says what is never sent', () => {
    const text = JSON.stringify(PERFORMANCE_INFO).toLowerCase();
    expect(text).not.toContain('anonymous');
    expect(text).toContain('random id');
    expect(PERFORMANCE_INFO.points.at(-1)).toMatch(/^Never what you read/);
    expect(text).not.toContain('—');
  });
});
