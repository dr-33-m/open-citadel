import { describe, expect, it } from 'vitest';
import type { Measurement, Schedule } from 'samwell-shared';

import {
  activeWindow,
  dueOn,
  expandOccurrences,
  expandPeriods,
  isPausedOn,
  scheduleKind,
  scheduleSummary,
  type LogView,
  type PauseWindow,
  type TrackableView,
} from '../occurrences';

const TZ = 'Africa/Harare';
const COMPLETION: Measurement = { type: 'COMPLETION' };

function expand(
  schedule: Schedule,
  opts: {
    startDate?: string;
    endDate?: string;
    pauses?: PauseWindow[];
    from?: string;
    to?: string;
  } = {},
) {
  return expandOccurrences({
    schedule,
    startDate: opts.startDate ?? '2026-09-01',
    endDate: opts.endDate ?? '2026-12-31',
    pauses: opts.pauses ?? [],
    range: { from: opts.from ?? '2026-09-01', to: opts.to ?? '2026-09-30' },
  });
}

function periods(
  schedule: Schedule,
  opts: {
    startDate?: string;
    endDate?: string;
    pauses?: PauseWindow[];
    from?: string;
    to?: string;
  } = {},
) {
  return expandPeriods({
    schedule,
    startDate: opts.startDate ?? '2026-09-01',
    endDate: opts.endDate ?? '2026-12-31',
    pauses: opts.pauses ?? [],
    range: { from: opts.from ?? '2026-09-01', to: opts.to ?? '2026-09-30' },
  });
}

function trackable(over: Partial<TrackableView> = {}): TrackableView {
  return {
    id: 't1',
    goalId: 'g1',
    title: 'Take a cold shower',
    description: null,
    timeOfDay: null,
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    status: 'ACTIVE',
    schedule: { type: 'DAILY', timezone: TZ },
    measurement: COMPLETION,
    pauses: [],
    ...over,
  };
}

function log(over: Partial<LogView> & { date: string }): LogView {
  return {
    id: `l-${over.date}`,
    trackableId: 't1',
    completed: 1,
    value: null,
    note: null,
    ...over,
  };
}

describe('scheduleKind', () => {
  it('separates the schedules that name days from the ones that name counts', () => {
    expect(scheduleKind({ type: 'DAILY', timezone: TZ })).toBe('fixed');
    expect(scheduleKind({ type: 'WEEKLY_DAYS', daysOfWeek: [1], timezone: TZ })).toBe('fixed');
    expect(scheduleKind({ type: 'INTERVAL', intervalDays: 3, timezone: TZ })).toBe('fixed');
    expect(scheduleKind({ type: 'SPECIFIC_DATES', dates: ['2026-09-05'], timezone: TZ })).toBe(
      'fixed',
    );
    expect(scheduleKind({ type: 'WEEKLY_TARGET', target: 6, timezone: TZ })).toBe('flexible');
    expect(scheduleKind({ type: 'MONTHLY_TARGET', target: 2, timezone: TZ })).toBe('flexible');
  });
});

describe('isPausedOn', () => {
  it('covers a closed window inclusively at both ends', () => {
    const pauses = [{ startDate: '2026-09-05', endDate: '2026-09-08' }];
    expect(isPausedOn('2026-09-04', pauses)).toBe(false);
    expect(isPausedOn('2026-09-05', pauses)).toBe(true);
    expect(isPausedOn('2026-09-08', pauses)).toBe(true);
    expect(isPausedOn('2026-09-09', pauses)).toBe(false);
  });

  it('runs forever when the pause is still open', () => {
    const pauses = [{ startDate: '2026-09-05', endDate: null }];
    expect(isPausedOn('2026-09-04', pauses)).toBe(false);
    expect(isPausedOn('2030-01-01', pauses)).toBe(true);
  });

  it('handles two overlapping pauses without confusion', () => {
    const pauses = [
      { startDate: '2026-09-05', endDate: '2026-09-10' },
      { startDate: '2026-09-08', endDate: '2026-09-12' },
    ];
    expect(isPausedOn('2026-09-06', pauses)).toBe(true);
    expect(isPausedOn('2026-09-11', pauses)).toBe(true);
    expect(isPausedOn('2026-09-13', pauses)).toBe(false);
  });
});

describe('activeWindow', () => {
  it('clips to the range', () => {
    expect(activeWindow('2026-09-01', '2026-09-30', { from: '2026-09-10', to: '2026-09-20' })).toEqual(
      { from: '2026-09-10', to: '2026-09-20' },
    );
  });

  it('is null when the trackable and the range do not overlap', () => {
    expect(activeWindow('2026-09-01', '2026-09-05', { from: '2026-10-01', to: '2026-10-31' })).toBeNull();
  });

  it('is null when the trackable ends before it starts', () => {
    expect(activeWindow('2026-09-10', '2026-09-01', { from: '2026-09-01', to: '2026-09-30' })).toBeNull();
  });
});

describe('expandOccurrences — DAILY', () => {
  it('is inclusive at both ends', () => {
    const days = expand({ type: 'DAILY', timezone: TZ }, { from: '2026-09-01', to: '2026-09-05' });
    expect(days).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
  });

  it('is clipped by the query range on both sides', () => {
    const days = expand(
      { type: 'DAILY', timezone: TZ },
      { startDate: '2026-09-05', endDate: '2026-09-20', from: '2026-09-10', to: '2026-09-12' },
    );
    expect(days).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
  });

  it('gives September 30 days', () => {
    expect(expand({ type: 'DAILY', timezone: TZ })).toHaveLength(30);
  });
});

describe('expandOccurrences — WEEKLY_DAYS', () => {
  it('emits only the listed days', () => {
    // September 2026 opens on a Tuesday: 4 Fridays and 4 Mondays.
    const days = expand({ type: 'WEEKLY_DAYS', daysOfWeek: [1, 5], timezone: TZ });
    expect(days).toEqual([
      '2026-09-04',
      '2026-09-07',
      '2026-09-11',
      '2026-09-14',
      '2026-09-18',
      '2026-09-21',
      '2026-09-25',
      '2026-09-28',
    ]);
  });

  it('crosses a month boundary with the right count', () => {
    // Every Tuesday from 29 September to 6 October 2026: the 29th and the 6th.
    const days = expand(
      { type: 'WEEKLY_DAYS', daysOfWeek: [2], timezone: TZ },
      { from: '2026-09-29', to: '2026-10-06' },
    );
    expect(days).toEqual(['2026-09-29', '2026-10-06']);
  });

  it('is not skewed by a DST transition', () => {
    // 29 March 2026 is the European spring-forward. A daily-Sunday schedule
    // across it must still land on both Sundays and lose neither.
    const days = expand(
      { type: 'WEEKLY_DAYS', daysOfWeek: [0], timezone: 'Europe/London' },
      { startDate: '2026-03-01', endDate: '2026-04-30', from: '2026-03-22', to: '2026-04-05' },
    );
    expect(days).toEqual(['2026-03-22', '2026-03-29', '2026-04-05']);
  });
});

describe('expandOccurrences — SPECIFIC_DATES', () => {
  it('drops dates outside the window, dedupes and sorts', () => {
    const days = expand(
      {
        type: 'SPECIFIC_DATES',
        dates: ['2026-09-17', '2026-09-05', '2026-09-05', '2026-08-01', '2027-01-01'],
        timezone: TZ,
      },
      { from: '2026-09-01', to: '2026-09-30' },
    );
    expect(days).toEqual(['2026-09-05', '2026-09-17']);
  });
});

describe('expandOccurrences — INTERVAL', () => {
  it('steps from the trackable start', () => {
    const days = expand(
      { type: 'INTERVAL', intervalDays: 3, timezone: TZ },
      { startDate: '2026-09-01', from: '2026-09-01', to: '2026-09-10' },
    );
    expect(days).toEqual(['2026-09-01', '2026-09-04', '2026-09-07', '2026-09-10']);
  });

  it('drops paused hits WITHOUT shifting the ones after them', () => {
    // The lattice is anchored at the start date, so resuming does not restart
    // the count — otherwise which days are expected would depend on when the
    // user happened to come back.
    const days = expand(
      { type: 'INTERVAL', intervalDays: 3, timezone: TZ },
      {
        startDate: '2026-09-01',
        pauses: [{ startDate: '2026-09-03', endDate: '2026-09-05' }],
        from: '2026-09-01',
        to: '2026-09-10',
      },
    );
    expect(days).toEqual(['2026-09-01', '2026-09-07', '2026-09-10']);
  });

  it('picks up mid-range without re-deriving the phase', () => {
    const days = expand(
      { type: 'INTERVAL', intervalDays: 5, timezone: TZ },
      { startDate: '2026-09-01', from: '2026-09-10', to: '2026-09-25' },
    );
    expect(days).toEqual(['2026-09-11', '2026-09-16', '2026-09-21']);
  });
});

describe('expandOccurrences — pauses', () => {
  it('removes exactly the paused days from a daily schedule', () => {
    const days = expand(
      { type: 'DAILY', timezone: TZ },
      {
        pauses: [{ startDate: '2026-09-10', endDate: '2026-09-12' }],
        from: '2026-09-08',
        to: '2026-09-14',
      },
    );
    expect(days).toEqual(['2026-09-08', '2026-09-09', '2026-09-13', '2026-09-14']);
  });

  it('removes everything from the start of an open pause', () => {
    const days = expand(
      { type: 'DAILY', timezone: TZ },
      { pauses: [{ startDate: '2026-09-03', endDate: null }], from: '2026-09-01', to: '2026-09-10' },
    );
    expect(days).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('yields nothing when the whole window is paused', () => {
    const days = expand(
      { type: 'DAILY', timezone: TZ },
      { pauses: [{ startDate: '2026-08-01', endDate: '2026-10-01' }] },
    );
    expect(days).toEqual([]);
  });
});

describe('expandOccurrences — degenerate windows', () => {
  it('yields nothing when the trackable ends before it starts', () => {
    expect(expand({ type: 'DAILY', timezone: TZ }, { startDate: '2026-09-10', endDate: '2026-09-01' })).toEqual([]);
  });

  it('yields nothing for a flexible schedule, which expects no particular day', () => {
    expect(expand({ type: 'WEEKLY_TARGET', target: 6, timezone: TZ })).toEqual([]);
  });
});

describe('expandPeriods — WEEKLY_TARGET', () => {
  it('produces contiguous, non-overlapping Monday-to-Sunday weeks', () => {
    const result = periods({ type: 'WEEKLY_TARGET', target: 6, timezone: TZ });
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i].from > result[i - 1].to).toBe(true);
    }
    // Every full week carries the full target.
    const full = result.filter((p) => p.from >= '2026-09-07' && p.to <= '2026-09-27');
    expect(full.every((p) => p.target === 6)).toBe(true);
  });

  it('pro-rates a first week the goal only partly covers', () => {
    // Starting Thursday 3 September leaves 4 of 7 days: 6 × 4/7 ≈ 3.
    const [first] = periods(
      { type: 'WEEKLY_TARGET', target: 6, timezone: TZ },
      { startDate: '2026-09-03', from: '2026-09-03', to: '2026-09-06' },
    );
    expect(first.target).toBe(3);
  });

  it('pro-rates a week a pause cuts into', () => {
    // Monday 7 to Sunday 13 September, paused Wednesday to Friday: 4 of 7 days.
    const [week] = periods(
      { type: 'WEEKLY_TARGET', target: 6, timezone: TZ },
      {
        pauses: [{ startDate: '2026-09-09', endDate: '2026-09-11' }],
        from: '2026-09-07',
        to: '2026-09-13',
      },
    );
    expect(week.target).toBe(3);
  });

  it('drops a period the user was present for too briefly to fail', () => {
    // One day of a 2-a-week target rounds to 0, so there is nothing to miss.
    const result = periods(
      { type: 'WEEKLY_TARGET', target: 2, timezone: TZ },
      { startDate: '2026-09-13', endDate: '2026-09-13', from: '2026-09-07', to: '2026-09-13' },
    );
    expect(result).toEqual([]);
  });

  it('keys every week distinctly across a year boundary', () => {
    const result = periods(
      { type: 'WEEKLY_TARGET', target: 3, timezone: TZ },
      { startDate: '2026-12-01', endDate: '2027-01-31', from: '2026-12-20', to: '2027-01-10' },
    );
    expect(new Set(result.map((p) => p.key)).size).toBe(result.length);
  });
});

describe('expandPeriods — MONTHLY_TARGET', () => {
  it('walks calendar months across a year boundary', () => {
    const result = periods(
      { type: 'MONTHLY_TARGET', target: 2, timezone: TZ },
      { startDate: '2026-11-01', endDate: '2027-02-28', from: '2026-11-01', to: '2027-02-28' },
    );
    expect(result.map((p) => p.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('handles a leap February as a full month', () => {
    const result = periods(
      { type: 'MONTHLY_TARGET', target: 4, timezone: TZ },
      { startDate: '2024-02-01', endDate: '2024-02-29', from: '2024-02-01', to: '2024-02-29' },
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: '2024-02', from: '2024-02-01', to: '2024-02-29', target: 4 });
  });
});

describe('dueOn', () => {
  it('offers a daily trackable that has not been logged today', () => {
    const t = trackable();
    const items = dueOn('2026-09-08', [t], new Map());
    expect(items).toHaveLength(1);
    expect(items[0].trackable.id).toBe('t1');
  });

  it('withdraws it once ANY log exists for the day, including a miss', () => {
    const t = trackable();
    const missed = new Map([['t1', [log({ date: '2026-09-08', completed: 0 })]]]);
    // The user has answered. Asking again would be asking twice.
    expect(dueOn('2026-09-08', [t], missed)).toHaveLength(0);
  });

  it('skips a paused, cancelled or out-of-window trackable', () => {
    const paused = trackable({ pauses: [{ startDate: '2026-09-01', endDate: null }] });
    const cancelled = trackable({ id: 't2', status: 'CANCELLED' });
    const future = trackable({ id: 't3', startDate: '2026-10-01' });
    expect(dueOn('2026-09-08', [paused, cancelled, future], new Map())).toHaveLength(0);
  });

  it('counts a flexible target across its week and reports progress', () => {
    const t = trackable({
      schedule: { type: 'WEEKLY_TARGET', target: 6, timezone: TZ },
      measurement: COMPLETION,
    });
    const logs = new Map([
      ['t1', [log({ date: '2026-09-07' }), log({ date: '2026-09-08' })]],
    ]);
    const [item] = dueOn('2026-09-09', [t], logs);
    expect(item.periodDone).toBe(2);
    expect(item.periodTarget).toBe(6);
    expect(item.periodLabel).toBe('2 OF 6 THIS WEEK');
  });

  it('drops a flexible trackable once its period target is met', () => {
    const t = trackable({ schedule: { type: 'WEEKLY_TARGET', target: 2, timezone: TZ } });
    const logs = new Map([
      ['t1', [log({ date: '2026-09-07' }), log({ date: '2026-09-08' })]],
    ]);
    expect(dueOn('2026-09-09', [t], logs)).toHaveLength(0);
  });

  it('does not let an explicit miss count toward a flexible target', () => {
    const t = trackable({ schedule: { type: 'WEEKLY_TARGET', target: 2, timezone: TZ } });
    const logs = new Map([
      ['t1', [log({ date: '2026-09-07' }), log({ date: '2026-09-08', completed: 0 })]],
    ]);
    const [item] = dueOn('2026-09-09', [t], logs);
    expect(item.periodDone).toBe(1);
  });

  it('withdraws a FLEXIBLE trackable the moment it is answered today', () => {
    // The miss does not count toward six-a-week, but the user has answered for
    // today — leaving the card in the deck asks them the same thing twice.
    const t = trackable({ schedule: { type: 'WEEKLY_TARGET', target: 6, timezone: TZ } });
    const missed = new Map([['t1', [log({ date: '2026-09-09', completed: 0 })]]]);
    expect(dueOn('2026-09-09', [t], missed)).toHaveLength(0);

    const done = new Map([['t1', [log({ date: '2026-09-09' })]]]);
    expect(dueOn('2026-09-09', [t], done)).toHaveLength(0);
  });

  it('still offers a flexible trackable on a LATER day after a miss', () => {
    const t = trackable({ schedule: { type: 'WEEKLY_TARGET', target: 6, timezone: TZ } });
    const logs = new Map([['t1', [log({ date: '2026-09-09', completed: 0 })]]]);
    expect(dueOn('2026-09-10', [t], logs)).toHaveLength(1);
  });

  it('orders timed trackables by the clock and drops untimed ones to the bottom', () => {
    const evening = trackable({ id: 'a', title: 'Read', timeOfDay: '21:00' });
    const untimed = trackable({ id: 'b', title: 'Publish' });
    const morning = trackable({ id: 'c', title: 'Cold shower', timeOfDay: '06:00' });
    const items = dueOn('2026-09-08', [evening, untimed, morning], new Map());
    expect(items.map((i) => i.trackable.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('scheduleSummary', () => {
  it('reads as English', () => {
    expect(scheduleSummary({ type: 'DAILY', timezone: TZ })).toBe('Every day');
    expect(scheduleSummary({ type: 'WEEKLY_TARGET', target: 6, timezone: TZ })).toBe('6× a week');
    expect(scheduleSummary({ type: 'INTERVAL', intervalDays: 3, timezone: TZ })).toBe('Every 3 days');
    expect(scheduleSummary({ type: 'WEEKLY_DAYS', daysOfWeek: [1, 3], timezone: TZ })).toBe('MON · WED');
    expect(scheduleSummary({ type: 'SPECIFIC_DATES', dates: ['2026-09-05'], timezone: TZ })).toBe('1 set date');
  });
});
