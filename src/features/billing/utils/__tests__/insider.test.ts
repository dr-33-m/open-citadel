import { describe, expect, it } from 'vitest';

import {
  insiderEndsAt,
  insiderMeterDetail,
  insiderPlanDetail,
  insiderWelcome,
} from '../insider';
import { formatTermDate } from '../subscription-lifecycle';

const YEAR_END = '2027-10-13T12:00:00.000Z';
const PERIOD_END = '2026-11-12T12:00:00.000Z';
const yearEnd = formatTermDate(YEAR_END);

describe('formatTermDate', () => {
  it('carries the year, which a renewal date does not need', () => {
    expect(yearEnd).toContain('2027');
    expect(formatTermDate(null)).toBeNull();
    expect(formatTermDate('not a date')).toBeNull();
  });
});

describe('insiderWelcome', () => {
  it('says the plan and its end in one line, then the term and the Neurons', () => {
    expect(insiderWelcome({ plan: 'maester', duration: 'year', endsAt: YEAR_END })).toEqual({
      line: `Maester Samwell is yours until ${yearEnd}.`,
      figures: [
        { key: 'term', value: '1 year', label: 'YOUR TERM' },
        { key: 'neurons', value: (2500).toLocaleString(), label: 'NEURONS A MONTH' },
      ],
    });
  });

  it('does not call a single grant monthly', () => {
    for (const duration of ['day', 'week', 'month'] as const) {
      const { figures } = insiderWelcome({ plan: 'archmaester', duration, endsAt: PERIOD_END });
      expect(figures[1]).toEqual({ key: 'neurons', value: (30000).toLocaleString(), label: 'NEURONS' });
    }
  });

  it('leaves the term out for a code that has no name for it', () => {
    const { figures } = insiderWelcome({ plan: 'maester', duration: null, endsAt: YEAR_END });
    expect(figures.map((figure) => figure.key)).toEqual(['neurons']);
  });
});

describe('an insider plan on a balance', () => {
  const insider = { source: 'insider', periodEndsAt: PERIOD_END, termEndsAt: YEAR_END } as const;
  const paid = { source: 'subscription', periodEndsAt: PERIOD_END, termEndsAt: null } as const;

  it('ends with its term, not its period', () => {
    expect(insiderEndsAt(insider)).toBe(YEAR_END);
    expect(insiderMeterDetail(insider)).toBe(`insider plan until ${yearEnd}`);
    expect(insiderPlanDetail('maester', insider)).toBe(`${(2500).toLocaleString()} neurons each month, until ${yearEnd}`);
  });

  it('is nothing on a paid plan', () => {
    expect(insiderEndsAt(paid)).toBeNull();
    expect(insiderMeterDetail(paid)).toBeNull();
  });

  it('falls back to the period against a server that sends no term', () => {
    const old = { source: 'insider', periodEndsAt: PERIOD_END, termEndsAt: null } as const;
    expect(insiderEndsAt(old)).toBe(PERIOD_END);
  });

  it('says a term of one period as one grant', () => {
    const week = { source: 'insider', periodEndsAt: PERIOD_END, termEndsAt: PERIOD_END } as const;
    expect(insiderPlanDetail('maester', week)).toBe(
      `${(2500).toLocaleString()} neurons, until ${formatTermDate(PERIOD_END)}`,
    );
  });
});
