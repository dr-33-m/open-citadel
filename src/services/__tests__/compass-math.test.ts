import { describe, expect, it } from 'vitest';

import {
  actionWeight,
  activeCheckin,
  addDaysYmd,
  compassDayFor,
  computeFinalVarianceDays,
  computeFocusScore,
  computeProgress,
  computeProjection,
  computeScheduleStatus,
  daysBetween,
  todayLocalYmd,
} from '../compass-math';

describe('computeFocusScore', () => {
  it('returns 0 for no actions', () => {
    expect(computeFocusScore([])).toBe(0);
  });

  it('weights by minutes when every action is timed (spec example: 67%)', () => {
    // 4h directly aligned + 1h supportive + 2h distraction = 4.75 / 7 ≈ 68 (spec rounds to 67)
    const score = computeFocusScore([
      { category: 'execution', alignment: 'directly_aligned', minutes: 240 },
      { category: 'learning', alignment: 'supportive', minutes: 60 },
      { category: 'learning', alignment: 'distraction', minutes: 120 },
    ]);
    expect(score).toBe(68);
  });

  it('falls back to unweighted mean when any minutes are missing', () => {
    const score = computeFocusScore([
      { category: 'execution', alignment: 'directly_aligned', minutes: null },
      { category: 'learning', alignment: 'distraction', minutes: 120 },
    ]);
    expect(score).toBe(50);
  });

  it('scores a fully aligned day at 100', () => {
    expect(
      computeFocusScore([
        { category: 'execution', alignment: 'directly_aligned', minutes: 60 },
        { category: 'execution', alignment: 'directly_aligned', minutes: 30 },
      ]),
    ).toBe(100);
  });

  it('uses the maintenance category weight regardless of alignment', () => {
    expect(actionWeight({ category: 'maintenance', alignment: 'directly_aligned' })).toBe(0.3);
    expect(actionWeight({ category: 'execution', alignment: 'directly_aligned' })).toBe(1);
  });
});

describe('date helpers', () => {
  it('daysBetween handles month and year boundaries', () => {
    expect(daysBetween('2026-07-15', '2026-07-17')).toBe(2);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-07-17', '2026-07-15')).toBe(-2);
  });

  it('daysBetween is exact across a DST change', () => {
    // Europe/US DST transitions fall in March/November; calendar diff must stay whole.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('addDaysYmd wraps months and years', () => {
    expect(addDaysYmd('2026-07-30', 3)).toBe('2026-08-02');
    expect(addDaysYmd('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('todayLocalYmd formats local dates', () => {
    expect(todayLocalYmd(new Date(2026, 6, 23, 9, 30))).toBe('2026-07-23');
  });
});

describe('compassDayFor', () => {
  const at = (h: number, m: number) => new Date(2026, 6, 23, h, m);

  it('06:00/22:00 user: boundary at 02:00', () => {
    expect(compassDayFor(at(1, 30), '06:00', '22:00')).toBe('2026-07-22');
    expect(compassDayFor(at(5, 45), '06:00', '22:00')).toBe('2026-07-23');
    expect(compassDayFor(at(23, 30), '06:00', '22:00')).toBe('2026-07-23');
  });

  it('09:00/00:00 night owl: boundary at 04:30', () => {
    expect(compassDayFor(at(0, 30), '09:00', '00:00')).toBe('2026-07-22');
    expect(compassDayFor(at(4, 29), '09:00', '00:00')).toBe('2026-07-22');
    expect(compassDayFor(at(8, 30), '09:00', '00:00')).toBe('2026-07-23');
    expect(compassDayFor(at(23, 59), '09:00', '00:00')).toBe('2026-07-23');
  });
});

describe('activeCheckin', () => {
  const at = (h: number, m: number) => new Date(2026, 6, 23, h, m);

  it('08:00/21:00 user: morning window is day until night, night window is night until ~02:30', () => {
    expect(activeCheckin(at(8, 0), '08:00', '21:00')).toBe('morning');
    expect(activeCheckin(at(12, 0), '08:00', '21:00')).toBe('morning');
    expect(activeCheckin(at(20, 59), '08:00', '21:00')).toBe('morning');
    expect(activeCheckin(at(21, 0), '08:00', '21:00')).toBe('night');
    expect(activeCheckin(at(23, 53), '08:00', '21:00')).toBe('night'); // cannot plan the morning this late
    expect(activeCheckin(at(2, 0), '08:00', '21:00')).toBe('night'); // before the 02:30 boundary, still reviewing
    expect(activeCheckin(at(2, 31), '08:00', '21:00')).toBe('morning'); // past the boundary, planning again
  });

  it('grace: a forgotten morning is still loggable through the afternoon', () => {
    expect(activeCheckin(at(16, 0), '08:00', '21:00')).toBe('morning');
  });

  it('09:00/00:00 night owl: boundary at 04:30', () => {
    expect(activeCheckin(at(23, 0), '09:00', '00:00')).toBe('morning'); // before midnight night time
    expect(activeCheckin(at(0, 30), '09:00', '00:00')).toBe('night');
    expect(activeCheckin(at(4, 0), '09:00', '00:00')).toBe('night');
    expect(activeCheckin(at(5, 0), '09:00', '00:00')).toBe('morning');
  });
});

describe('computeProjection', () => {
  it('returns nulls without enough execution data', () => {
    expect(
      computeProjection({
        completedUnits: 0,
        estimatedUnits: 100,
        startDate: '2026-07-01',
        today: '2026-07-10',
      }),
    ).toEqual({ projectedDate: null, avgDailyUnits: null });

    expect(
      computeProjection({
        completedUnits: 10,
        estimatedUnits: 100,
        startDate: '2026-07-23',
        today: '2026-07-23',
      }),
    ).toEqual({ projectedDate: null, avgDailyUnits: null });
  });

  it('projects remaining days from average daily pace', () => {
    // 51 units in 10 days → 5.1/day; 49 remaining → ceil(9.6) = 10 days out.
    const { projectedDate, avgDailyUnits } = computeProjection({
      completedUnits: 51,
      estimatedUnits: 100,
      startDate: '2026-07-01',
      today: '2026-07-10',
    });
    expect(avgDailyUnits).toBeCloseTo(5.1);
    expect(projectedDate).toBe('2026-07-20');
  });

  it('projects zero remaining days when the estimate is already met', () => {
    const { projectedDate } = computeProjection({
      completedUnits: 100,
      estimatedUnits: 100,
      startDate: '2026-07-01',
      today: '2026-07-10',
    });
    expect(projectedDate).toBe('2026-07-10');
  });
});

describe('computeScheduleStatus', () => {
  it('is unknown without a projection', () => {
    expect(computeScheduleStatus('2026-07-15', null)).toEqual({
      status: 'unknown',
      varianceDays: null,
    });
  });

  it('is on track within one day of target', () => {
    expect(computeScheduleStatus('2026-07-15', '2026-07-16')).toEqual({
      status: 'on_track',
      varianceDays: 1,
    });
  });

  it('reports behind and ahead with signed variance', () => {
    expect(computeScheduleStatus('2026-07-15', '2026-07-17')).toEqual({
      status: 'behind',
      varianceDays: 2,
    });
    expect(computeScheduleStatus('2026-07-15', '2026-07-12')).toEqual({
      status: 'ahead',
      varianceDays: -3,
    });
  });
});

describe('progress and final variance', () => {
  it('clamps progress to 0..1', () => {
    expect(computeProgress(51, 100)).toBe(0.51);
    expect(computeProgress(120, 100)).toBe(1);
    expect(computeProgress(5, 0)).toBe(0);
  });

  it('final variance is actual minus target in days', () => {
    expect(computeFinalVarianceDays('2026-07-15', '2026-07-19')).toBe(4);
    expect(computeFinalVarianceDays('2026-07-15', '2026-07-13')).toBe(-2);
  });
});
