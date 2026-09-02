import { describe, expect, it } from 'vitest';
import type { Measurement, Schedule } from 'samwell-shared';

import {
  fixedConsistency,
  flexibleConsistency,
  goalExecution,
  goalOutcome,
  isLogSatisfying,
  trackableConsistency,
} from '../consistency';
import type { DateRange, LogView, TrackableView } from '../occurrences';

const TZ = 'Africa/Harare';
const DAILY: Schedule = { type: 'DAILY', timezone: TZ };
const COMPLETION: Measurement = { type: 'COMPLETION' };

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
    schedule: DAILY,
    measurement: COMPLETION,
    pauses: [],
    ...over,
  };
}

function log(date: string, over: Partial<LogView> = {}): LogView {
  return {
    id: `l-${date}-${over.value ?? over.completed ?? 'x'}`,
    trackableId: 't1',
    date,
    completed: 1,
    value: null,
    note: null,
    ...over,
  };
}

const WEEK: DateRange = { from: '2026-09-07', to: '2026-09-13' };

describe('isLogSatisfying', () => {
  it('needs an explicit 1 for a completion', () => {
    expect(isLogSatisfying({ completed: 1, value: null }, COMPLETION)).toBe(true);
    expect(isLogSatisfying({ completed: null, value: null }, COMPLETION)).toBe(false);
  });

  it('compares a value against its target at read time', () => {
    const m: Measurement = { type: 'QUANTITY', target: 500, unit: 'words' };
    expect(isLogSatisfying({ completed: null, value: 350 }, m)).toBe(false);
    expect(isLogSatisfying({ completed: null, value: 500 }, m)).toBe(true);
    expect(isLogSatisfying({ completed: null, value: 600 }, m)).toBe(true);
  });

  it('lets an explicit "didn\'t happen" lose even when a value sits beside it', () => {
    const m: Measurement = { type: 'DURATION', target: 30, unit: 'minutes' };
    expect(isLogSatisfying({ completed: 0, value: 45 }, m)).toBe(false);
  });

  it('counts any rating, because a rating has no target', () => {
    const m: Measurement = { type: 'RATING', min: 1, max: 5 };
    expect(isLogSatisfying({ completed: null, value: 1 }, m)).toBe(true);
    expect(isLogSatisfying({ completed: null, value: 5 }, m)).toBe(true);
    expect(isLogSatisfying({ completed: null, value: null }, m)).toBe(false);
  });
});

describe('fixedConsistency', () => {
  it('is null, not zero, when nothing has been expected yet', () => {
    // The goal starts next month. Being 0% consistent before you were ever
    // asked to do anything is the most demoralising number available.
    const result = fixedConsistency({
      trackable: trackable({ startDate: '2026-10-01', endDate: '2026-10-31' }),
      logs: [],
      range: WEEK,
    });
    expect(result.expected).toBe(0);
    expect(result.ratio).toBeNull();
  });

  it('counts five of seven days', () => {
    const logs = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-11', '2026-09-12'].map((d) =>
      log(d),
    );
    const result = fixedConsistency({ trackable: trackable(), logs, range: WEEK });
    expect(result).toMatchObject({ expected: 7, completed: 5, bonus: 0 });
    expect(result.ratio).toBeCloseTo(5 / 7);
    expect(result.missed).toEqual(['2026-09-10', '2026-09-13']);
  });

  it('does not count a quantity log that fell short of its target', () => {
    const t = trackable({ measurement: { type: 'QUANTITY', target: 500, unit: 'words' } });
    const result = fixedConsistency({
      trackable: t,
      logs: [log('2026-09-07', { completed: null, value: 350 })],
      range: { from: '2026-09-07', to: '2026-09-07' },
    });
    expect(result.completed).toBe(0);
    expect(result.ratio).toBe(0);
  });

  it('counts one that met or beat it, and only once', () => {
    const t = trackable({ measurement: { type: 'QUANTITY', target: 500, unit: 'words' } });
    const result = fixedConsistency({
      trackable: t,
      logs: [log('2026-09-07', { completed: null, value: 600 })],
      range: { from: '2026-09-07', to: '2026-09-07' },
    });
    expect(result).toMatchObject({ expected: 1, completed: 1, bonus: 0 });
  });

  it('treats a second log on one scheduled day as bonus, not a second completion', () => {
    // Twice on Monday does not make up for Tuesday, and the ratio stays ≤ 1.
    const result = fixedConsistency({
      trackable: trackable(),
      logs: [log('2026-09-07'), log('2026-09-07', { id: 'second' })],
      range: { from: '2026-09-07', to: '2026-09-08' },
    });
    expect(result).toMatchObject({ expected: 2, completed: 1, bonus: 1 });
    expect(result.ratio).toBe(0.5);
  });

  it('keeps an off-schedule log out of the ratio but records it as bonus', () => {
    // Mondays only; the user also did it on Wednesday.
    const t = trackable({ schedule: { type: 'WEEKLY_DAYS', daysOfWeek: [1], timezone: TZ } });
    const result = fixedConsistency({
      trackable: t,
      logs: [log('2026-09-07'), log('2026-09-09')],
      range: WEEK,
    });
    expect(result).toMatchObject({ expected: 1, completed: 1, bonus: 1 });
    expect(result.ratio).toBe(1);
  });

  it('counts an explicit miss exactly like a silent one', () => {
    // The note explains; it does not earn credit. Rewarding the writing of an
    // excuse would make the number reward excuses.
    const explained = fixedConsistency({
      trackable: trackable(),
      logs: [log('2026-09-07', { completed: 0, note: 'editing ran long' })],
      range: { from: '2026-09-07', to: '2026-09-08' },
    });
    const silent = fixedConsistency({
      trackable: trackable(),
      logs: [],
      range: { from: '2026-09-07', to: '2026-09-08' },
    });
    expect(explained.ratio).toBe(silent.ratio);
    expect(explained.ratio).toBe(0);
  });

  it('does not drop the ratio for a pause', () => {
    // Paused Wednesday to Friday, everything else done: still 100%. Paused is
    // not missed, and resuming must not retroactively punish the gap.
    const t = trackable({ pauses: [{ startDate: '2026-09-09', endDate: '2026-09-11' }] });
    const logs = ['2026-09-07', '2026-09-08', '2026-09-12', '2026-09-13'].map((d) => log(d));
    const result = trackableConsistency({ trackable: t, logs, range: WEEK });
    expect(result).toMatchObject({ expected: 4, completed: 4 });
    expect(result.ratio).toBe(1);
  });
});

describe('flexibleConsistency', () => {
  it('scores a week against its target', () => {
    const t = trackable({ schedule: { type: 'WEEKLY_TARGET', target: 6, timezone: TZ } });
    const logs = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'].map((d) =>
      log(d),
    );
    const result = flexibleConsistency({ trackable: t, logs, range: WEEK });
    expect(result).toMatchObject({ expected: 6, completed: 5 });
    expect(result.ratio).toBeCloseTo(0.8333, 4);
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0]).toMatchObject({ target: 6, done: 5 });
  });

  it('aggregates the spec\'s 17 of 18 across three weeks', () => {
    const t = trackable({
      schedule: { type: 'WEEKLY_TARGET', target: 6, timezone: TZ },
      startDate: '2026-09-07',
      endDate: '2026-09-27',
    });
    const days = [
      // Week 1: 6 of 6.
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12',
      // Week 2: 5 of 6.
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
      // Week 3: 6 of 6.
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
    ];
    const result = flexibleConsistency({
      trackable: t,
      logs: days.map((d) => log(d)),
      range: { from: '2026-09-07', to: '2026-09-27' },
    });
    expect(result).toMatchObject({ expected: 18, completed: 17 });
    expect(result.ratio).toBeCloseTo(0.9444, 4);
  });

  it('caps a week at its target and banks the rest as bonus', () => {
    const t = trackable({ schedule: { type: 'WEEKLY_TARGET', target: 6, timezone: TZ } });
    const logs = [
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
      '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-13',
    ].map((d, i) => log(d, { id: `l${i}` }));
    const result = flexibleConsistency({ trackable: t, logs, range: WEEK });
    expect(result).toMatchObject({ expected: 6, completed: 6, bonus: 2 });
    expect(result.ratio).toBe(1);
  });

  it('never reports a missed day, because a flexible target has none', () => {
    const t = trackable({ schedule: { type: 'WEEKLY_TARGET', target: 2, timezone: TZ } });
    const result = flexibleConsistency({ trackable: t, logs: [log('2026-09-07')], range: WEEK });
    expect(result.missed).toEqual([]);
  });

  it('pro-rates rather than failing a week a pause cut into', () => {
    const t = trackable({
      schedule: { type: 'WEEKLY_TARGET', target: 6, timezone: TZ },
      pauses: [{ startDate: '2026-09-09', endDate: '2026-09-11' }],
    });
    const result = flexibleConsistency({
      trackable: t,
      logs: [log('2026-09-07'), log('2026-09-08'), log('2026-09-12')],
      range: WEEK,
    });
    expect(result.expected).toBe(3);
    expect(result.completed).toBe(3);
    expect(result.ratio).toBe(1);
  });
});

describe('goalExecution', () => {
  it('weights by expected occurrences rather than averaging trackables', () => {
    // A perfect month of daily work plus one missed monthly review is 30/31,
    // not the 50% an average of the two ratios would report.
    const daily = fixedConsistency({
      trackable: trackable({ id: 'daily' }),
      logs: Array.from({ length: 30 }, (_, i) =>
        log(`2026-09-${String(i + 1).padStart(2, '0')}`, { id: `d${i}` }),
      ),
      range: { from: '2026-09-01', to: '2026-09-30' },
    });
    const monthly = flexibleConsistency({
      trackable: trackable({
        id: 'monthly',
        schedule: { type: 'MONTHLY_TARGET', target: 1, timezone: TZ },
      }),
      logs: [],
      range: { from: '2026-09-01', to: '2026-09-30' },
    });

    const execution = goalExecution([daily, monthly]);
    expect(execution).toMatchObject({ expected: 31, completed: 30 });
    expect(execution.ratio).toBeCloseTo(30 / 31, 4);
    expect(execution.ratio).not.toBeCloseTo(0.5, 1);
  });

  it('is null when nothing has been expected across the whole goal', () => {
    expect(goalExecution([]).ratio).toBeNull();
  });

  it('sorts the breakdown worst first, so the weak link is nameable', () => {
    const good = fixedConsistency({
      trackable: trackable({ id: 'good', title: 'Reddit' }),
      logs: [log('2026-09-07'), log('2026-09-08')],
      range: { from: '2026-09-07', to: '2026-09-08' },
    });
    const bad = fixedConsistency({
      trackable: trackable({ id: 'bad', title: 'Publish' }),
      logs: [],
      range: { from: '2026-09-07', to: '2026-09-08' },
    });
    expect(goalExecution([good, bad]).breakdown[0].title).toBe('Publish');
  });
});

describe('goalOutcome', () => {
  it('sums values from trackables measured in the goal\'s unit', () => {
    const earning = trackable({
      id: 'earn',
      measurement: { type: 'AMOUNT', target: 100, unit: 'USD' },
    });
    const logs = new Map([
      [
        'earn',
        [
          log('2026-09-07', { completed: null, value: 700 }),
          log('2026-09-14', { completed: null, value: 500 }),
        ],
      ],
    ]);
    const outcome = goalOutcome({ outcomeTarget: 4000, outcomeUnit: 'USD' }, [earning], logs);
    expect(outcome).toEqual({ value: 1200, target: 4000, unit: 'USD' });
  });

  it('counts a value that fell short of its own target', () => {
    // $75 against a $100 daily target is still $75 earned; execution and
    // outcome are different questions.
    const earning = trackable({
      id: 'earn',
      measurement: { type: 'AMOUNT', target: 100, unit: 'USD' },
    });
    const logs = new Map([['earn', [log('2026-09-07', { completed: null, value: 75 })]]]);
    expect(goalOutcome({ outcomeTarget: 4000, outcomeUnit: 'USD' }, [earning], logs)?.value).toBe(75);
  });

  it('ignores trackables measured in another unit, and explicit misses', () => {
    const earning = trackable({
      id: 'earn',
      measurement: { type: 'AMOUNT', target: 100, unit: 'USD' },
    });
    const reading = trackable({
      id: 'read',
      measurement: { type: 'DURATION', target: 30, unit: 'minutes' },
    });
    const logs = new Map([
      [
        'earn',
        [
          log('2026-09-07', { completed: null, value: 700 }),
          log('2026-09-08', { completed: 0, value: null }),
        ],
      ],
      ['read', [log('2026-09-07', { completed: null, value: 45 })]],
    ]);
    expect(
      goalOutcome({ outcomeTarget: 4000, outcomeUnit: 'USD' }, [earning, reading], logs)?.value,
    ).toBe(700);
  });

  it('is null for a purely behavioural goal', () => {
    expect(goalOutcome({ outcomeTarget: null, outcomeUnit: null }, [trackable()], new Map())).toBeNull();
  });
});
