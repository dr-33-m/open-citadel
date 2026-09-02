import { describe, expect, it } from 'vitest';

import {
  addDaysYmd,
  dayOfWeek,
  daysBetween,
  endOfMonthYmd,
  endOfWeekYmd,
  isoWeekKey,
  isValidYmd,
  localDayString,
  maxYmd,
  minYmd,
  monthKey,
  parseYmd,
  startOfMonthYmd,
  startOfWeekYmd,
  ymdRange,
} from '../day';

describe('localDayString', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // 23:30 local on the 5th is the 6th in UTC for anyone east of it, and the
    // 5th is what the user's calendar says.
    const d = new Date(2026, 8, 5, 23, 30);
    expect(localDayString(d)).toBe('2026-09-05');
  });

  it('pads single-digit months and days', () => {
    expect(localDayString(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('parseYmd', () => {
  it('splits into numbers', () => {
    expect(parseYmd('2026-09-05')).toEqual({ year: 2026, month: 9, day: 5 });
  });
});

describe('isValidYmd', () => {
  it('accepts a real date', () => {
    expect(isValidYmd('2026-02-28')).toBe(true);
  });

  it('accepts 29 February in a leap year and rejects it otherwise', () => {
    expect(isValidYmd('2024-02-29')).toBe(true);
    expect(isValidYmd('2026-02-29')).toBe(false);
  });

  it('rejects impossible days that would otherwise roll over', () => {
    expect(isValidYmd('2026-04-31')).toBe(false);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('2026-00-10')).toBe(false);
  });

  it('rejects malformed and non-string input', () => {
    expect(isValidYmd('5 September 2026')).toBe(false);
    expect(isValidYmd('2026-9-5')).toBe(false);
    expect(isValidYmd(20260905)).toBe(false);
    expect(isValidYmd(null)).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts forward and backward', () => {
    expect(daysBetween('2026-09-01', '2026-09-05')).toBe(4);
    expect(daysBetween('2026-09-05', '2026-09-01')).toBe(-4);
    expect(daysBetween('2026-09-05', '2026-09-05')).toBe(0);
  });

  it('crosses a month boundary', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3);
  });

  it('crosses a year boundary', () => {
    expect(daysBetween('2025-12-30', '2026-01-02')).toBe(3);
  });

  it('counts a leap February at 29 days', () => {
    expect(daysBetween('2024-02-01', '2024-03-01')).toBe(29);
    expect(daysBetween('2026-02-01', '2026-03-01')).toBe(28);
  });

  it('is unaffected by a DST transition', () => {
    // Northern-hemisphere spring forward, 29 March 2026 in most of Europe.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    // And autumn back, 25 October 2026.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('addDaysYmd', () => {
  it('moves forward and backward', () => {
    expect(addDaysYmd('2026-09-05', 3)).toBe('2026-09-08');
    expect(addDaysYmd('2026-09-05', -5)).toBe('2026-08-31');
  });

  it('crosses a year boundary', () => {
    expect(addDaysYmd('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDaysYmd('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(addDaysYmd('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysYmd('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('does not lose a day across a DST transition', () => {
    expect(addDaysYmd('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysYmd('2026-03-29', 1)).toBe('2026-03-30');
  });
});

describe('ymdRange', () => {
  it('is inclusive at both ends', () => {
    expect(ymdRange('2026-09-01', '2026-09-04')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
  });

  it('returns a single day when both ends match', () => {
    expect(ymdRange('2026-09-01', '2026-09-01')).toEqual(['2026-09-01']);
  });

  it('returns nothing for a window that runs backwards', () => {
    expect(ymdRange('2026-09-04', '2026-09-01')).toEqual([]);
  });

  it('spans a month boundary with the right count', () => {
    expect(ymdRange('2026-08-30', '2026-09-02')).toHaveLength(4);
  });
});

describe('dayOfWeek', () => {
  it('is Sunday-based, matching Date#getDay', () => {
    expect(dayOfWeek('2026-09-06')).toBe(0); // Sunday
    expect(dayOfWeek('2026-09-07')).toBe(1); // Monday
    expect(dayOfWeek('2026-09-12')).toBe(6); // Saturday
  });
});

describe('startOfWeekYmd / endOfWeekYmd', () => {
  it('starts the week on Monday', () => {
    // Wednesday 9 September 2026 → Monday the 7th.
    expect(startOfWeekYmd('2026-09-09')).toBe('2026-09-07');
    expect(endOfWeekYmd('2026-09-09')).toBe('2026-09-13');
  });

  it('treats Sunday as the END of its week, not the start', () => {
    // This is the whole point of the Monday rule: Sunday the 13th belongs to
    // the week that began Monday the 7th.
    expect(startOfWeekYmd('2026-09-13')).toBe('2026-09-07');
  });

  it('is idempotent on a Monday', () => {
    expect(startOfWeekYmd('2026-09-07')).toBe('2026-09-07');
  });

  it('reaches back across a month boundary', () => {
    // Tuesday 1 September 2026 → Monday 31 August.
    expect(startOfWeekYmd('2026-09-01')).toBe('2026-08-31');
  });
});

describe('isoWeekKey', () => {
  it('keys a mid-year week', () => {
    expect(isoWeekKey('2026-09-09')).toBe('2026-W37');
  });

  it('gives every day of one week the same key', () => {
    const keys = ymdRange('2026-09-07', '2026-09-13').map(isoWeekKey);
    expect(new Set(keys).size).toBe(1);
  });

  it('assigns a late-December week to the NEXT ISO year when its Thursday lands there', () => {
    // Monday 30 December 2024's Thursday is 2 January 2025, so the whole week
    // is 2025-W01 — the year in the key is not the calendar year.
    expect(isoWeekKey('2024-12-30')).toBe('2025-W01');
    expect(isoWeekKey('2025-01-02')).toBe('2025-W01');
  });

  it('assigns an early-January day to the PREVIOUS ISO year when it belongs there', () => {
    // Friday 1 January 2027 sits in the week that began Monday 28 December
    // 2026, whose Thursday (31 December) is still 2026 — and 2026 is a
    // 53-week ISO year because it opens on a Thursday.
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(isoWeekKey('2026-12-28')).toBe('2026-W53');
    // 1 January 2026 is itself a Thursday, so its week really is 2026-W01.
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
  });

  it('does not collide across a year boundary', () => {
    expect(isoWeekKey('2026-12-21')).not.toBe(isoWeekKey('2026-12-28'));
  });
});

describe('startOfMonthYmd / endOfMonthYmd', () => {
  it('finds both ends of an ordinary month', () => {
    expect(startOfMonthYmd('2026-09-17')).toBe('2026-09-01');
    expect(endOfMonthYmd('2026-09-17')).toBe('2026-09-30');
  });

  it('ends a 31-day month correctly', () => {
    expect(endOfMonthYmd('2026-08-01')).toBe('2026-08-31');
  });

  it('ends February on the 28th, or the 29th in a leap year', () => {
    expect(endOfMonthYmd('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonthYmd('2024-02-10')).toBe('2024-02-29');
  });

  it('ends December without rolling into the next year', () => {
    expect(endOfMonthYmd('2026-12-05')).toBe('2026-12-31');
  });
});

describe('monthKey', () => {
  it('is a sortable year-month', () => {
    expect(monthKey('2026-03-17')).toBe('2026-03');
    expect(monthKey('2026-11-01') > monthKey('2026-03-17')).toBe(true);
    expect(monthKey('2027-01-01') > monthKey('2026-11-01')).toBe(true);
  });
});

describe('maxYmd / minYmd', () => {
  it('picks the later and the earlier', () => {
    expect(maxYmd('2026-09-01', '2026-09-05')).toBe('2026-09-05');
    expect(minYmd('2026-09-01', '2026-09-05')).toBe('2026-09-01');
  });

  it('compares correctly across a year boundary', () => {
    expect(maxYmd('2025-12-31', '2026-01-01')).toBe('2026-01-01');
  });
});
