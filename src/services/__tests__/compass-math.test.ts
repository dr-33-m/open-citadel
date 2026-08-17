import { describe, expect, it } from 'vitest';

import {
  actionWeight,
  activeCheckin,
  addDaysYmd,
  buildTelemetry,
  compassDayFor,
  computeFinalVarianceDays,
  computeFocusScore,
  computeGoalTrack,
  computeProgress,
  computeProjection,
  computeScheduleStatus,
  daysBetween,
  deriveGoalRank,
  earliestYmd,
  isGoalComplete,
  isMilestoneFullyStepped,
  latestYmd,
  orderMissionSteps,
  stepThresholdDate,
  todayLocalYmd,
} from '../compass-math';

const step = (title: string, order?: number) => ({
  title,
  detail: '',
  icon: 'circle' as const,
  ...(order != null ? { order } : {}),
});

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

  it('does not drift overnight when no new work is reported', () => {
    // The drift bug: identical state read at the night check-in and again the
    // next morning projected two days apart, flipping the pace verdict with the
    // clock alone. Anchored to the last reported day, both reads agree.
    const state = { completedUnits: 20, estimatedUnits: 40, startDate: '2026-07-01' };
    const night = computeProjection({
      ...state,
      today: '2026-07-10',
      lastReportedDate: '2026-07-10',
    });
    const nextMorning = computeProjection({
      ...state,
      today: '2026-07-11',
      lastReportedDate: '2026-07-10',
    });

    expect(night.projectedDate).toBe('2026-07-20');
    expect(nextMorning.projectedDate).toBe('2026-07-20');
    expect(nextMorning.avgDailyUnits).toBe(night.avgDailyUnits);
    expect(computeScheduleStatus('2026-07-21', night.projectedDate, '2026-07-10')).toEqual(
      computeScheduleStatus('2026-07-21', nextMorning.projectedDate, '2026-07-11'),
    );
  });

  it('does slip once an empty night check-in actually lands', () => {
    // Stability is not denial: a reported day with zero steps must cost pace.
    const { projectedDate } = computeProjection({
      completedUnits: 20,
      estimatedUnits: 40,
      startDate: '2026-07-01',
      today: '2026-07-11',
      lastReportedDate: '2026-07-11',
    });
    expect(projectedDate).toBe('2026-07-22');
  });

  it('floors a stale projection at today rather than pointing into the past', () => {
    // Silence is not pace data, but a finish date already gone is not a
    // projection either. Long gaps decay to "at best, today".
    const { projectedDate } = computeProjection({
      completedUnits: 20,
      estimatedUnits: 40,
      startDate: '2026-07-01',
      today: '2026-08-20',
      lastReportedDate: '2026-07-10',
    });
    expect(projectedDate).toBe('2026-08-20');
  });

  it('falls back to today when the milestone was never reported', () => {
    expect(
      computeProjection({
        completedUnits: 51,
        estimatedUnits: 100,
        startDate: '2026-07-01',
        today: '2026-07-10',
      }).projectedDate,
    ).toBe('2026-07-20');
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
  it('is unknown without a projection while the target is still ahead', () => {
    expect(computeScheduleStatus('2026-07-15', null, '2026-07-01')).toEqual({
      status: 'unknown',
      varianceDays: null,
    });
  });

  it('is behind without a projection once the target has passed', () => {
    // Zero logged execution is not zero information: nothing finishes before
    // today, so a target that is already gone is provably missed.
    expect(computeScheduleStatus('2026-07-15', null, '2026-07-27')).toEqual({
      status: 'behind',
      varianceDays: 12,
    });
  });

  it('stays unknown inside the one-day tolerance of a just-passed target', () => {
    expect(computeScheduleStatus('2026-07-15', null, '2026-07-16')).toEqual({
      status: 'unknown',
      varianceDays: null,
    });
  });

  it('is on track within one day of target', () => {
    expect(computeScheduleStatus('2026-07-15', '2026-07-16', '2026-07-10')).toEqual({
      status: 'on_track',
      varianceDays: 1,
    });
  });

  it('reports behind and ahead with signed variance', () => {
    expect(computeScheduleStatus('2026-07-15', '2026-07-17', '2026-07-10')).toEqual({
      status: 'behind',
      varianceDays: 2,
    });
    expect(computeScheduleStatus('2026-07-15', '2026-07-12', '2026-07-10')).toEqual({
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

describe('deriveGoalRank', () => {
  it('is null with no variance data', () => {
    expect(deriveGoalRank(null)).toBeNull();
  });

  it('is B within the ±1 day on-track tolerance', () => {
    expect(deriveGoalRank(0)).toBe('B');
    expect(deriveGoalRank(1)).toBe('B');
    expect(deriveGoalRank(-1)).toBe('B');
  });

  it('is A when finished early, beyond the tolerance', () => {
    expect(deriveGoalRank(-2)).toBe('A');
    expect(deriveGoalRank(-10)).toBe('A');
  });

  it('is C when finished late, beyond the tolerance', () => {
    expect(deriveGoalRank(2)).toBe('C');
    expect(deriveGoalRank(10)).toBe('C');
  });
});

describe('latestYmd', () => {
  it('picks the latest date and ignores gaps', () => {
    expect(latestYmd(['2026-07-15', null, '2026-09-02', undefined, '2026-08-30'])).toBe(
      '2026-09-02',
    );
  });

  it('is null when nothing has a date', () => {
    expect(latestYmd([])).toBeNull();
    expect(latestYmd([null, undefined])).toBeNull();
  });

  it('compares across month and year boundaries', () => {
    expect(latestYmd(['2026-12-31', '2027-01-01'])).toBe('2027-01-01');
    expect(latestYmd(['2026-09-09', '2026-09-10'])).toBe('2026-09-10');
  });
});

describe('earliestYmd', () => {
  it('picks the earliest date and ignores gaps', () => {
    expect(earliestYmd(['2026-09-02', null, '2026-07-15', undefined])).toBe('2026-07-15');
    expect(earliestYmd(['2027-01-01', '2026-12-31'])).toBe('2026-12-31');
  });

  it('is null when nothing has a date', () => {
    expect(earliestYmd([])).toBeNull();
    expect(earliestYmd([null, undefined])).toBeNull();
  });
});

describe('goal rank is dated by the finish, not the archive tap', () => {
  const target = '2026-09-01';
  const milestoneFinishes = ['2026-07-04', '2026-09-01', '2026-08-12'];

  it('grades on-time work as B however late the driver archives it', () => {
    const finishDate = latestYmd(milestoneFinishes) ?? '2026-09-20';
    expect(deriveGoalRank(computeFinalVarianceDays(target, finishDate))).toBe('B');
  });

  it('is the C it used to give when the archive date is used instead', () => {
    // Guards the regression directly: same goal, graded by the tap, was a C.
    expect(deriveGoalRank(computeFinalVarianceDays(target, '2026-09-20'))).toBe('C');
  });

  it('still grades a genuinely late finish as C', () => {
    const finishDate = latestYmd([...milestoneFinishes, '2026-09-30']) ?? '';
    expect(deriveGoalRank(computeFinalVarianceDays(target, finishDate))).toBe('C');
  });
});

describe('stepThresholdDate', () => {
  const reports = [
    { date: '2026-07-03', units: 4 },
    { date: '2026-07-01', units: 5 },
    { date: '2026-07-08', units: 6 },
    { date: '2026-07-05', units: 0 },
  ];

  it('finds the day the logged steps crossed the estimate', () => {
    expect(stepThresholdDate(reports, 15)).toBe('2026-07-08');
    expect(stepThresholdDate(reports, 9)).toBe('2026-07-03');
    expect(stepThresholdDate(reports, 5)).toBe('2026-07-01');
  });

  it('ignores the order rows come back in', () => {
    expect(stepThresholdDate([...reports].reverse(), 9)).toBe('2026-07-03');
  });

  it('is null when the estimate was never reached', () => {
    expect(stepThresholdDate(reports, 100)).toBeNull();
    expect(stepThresholdDate([], 15)).toBeNull();
  });

  it('is null for a zero estimate rather than claiming the first day', () => {
    expect(stepThresholdDate(reports, 0)).toBeNull();
  });

  it('dates a milestone by the crossing, not by a later empty check-in', () => {
    // The whole point: steps finished on the 8th, driver kept checking in with
    // nothing for a week. The milestone finished on the 8th.
    const trailing = [...reports, { date: '2026-07-15', units: 0 }];
    expect(stepThresholdDate(trailing, 15)).toBe('2026-07-08');
  });
});

describe('isMilestoneFullyStepped', () => {
  it('is true once logged steps reach the estimate', () => {
    expect(
      isMilestoneFullyStepped({ completedEffortUnits: 15, estimatedEffortUnits: 15 }),
    ).toBe(true);
    expect(
      isMilestoneFullyStepped({ completedEffortUnits: 16.5, estimatedEffortUnits: 15 }),
    ).toBe(true);
  });

  it('is false short of the estimate', () => {
    expect(
      isMilestoneFullyStepped({ completedEffortUnits: 14.9, estimatedEffortUnits: 15 }),
    ).toBe(false);
  });

  it('is false for a zero-step milestone rather than vacuously true', () => {
    expect(isMilestoneFullyStepped({ completedEffortUnits: 0, estimatedEffortUnits: 0 })).toBe(
      false,
    );
  });
});

describe('isGoalComplete', () => {
  it('is false with no estimate to compare against', () => {
    expect(isGoalComplete(5, null)).toBe(false);
    expect(isGoalComplete(0, null)).toBe(false);
  });

  it('is false when archived before reaching the planned scope', () => {
    expect(isGoalComplete(0, 7)).toBe(false);
    expect(isGoalComplete(6, 7)).toBe(false);
  });

  it('is true once completed milestones reach or pass the estimate', () => {
    expect(isGoalComplete(7, 7)).toBe(true);
    expect(isGoalComplete(9, 7)).toBe(true);
  });
});

describe('orderMissionSteps', () => {
  it('sorts by order when every step has one', () => {
    const mission = [step('third', 3), step('first', 1), step('second', 2)];
    expect(orderMissionSteps(mission).map((s) => s.title)).toEqual(['first', 'second', 'third']);
  });

  it('leaves the array untouched when any step is missing order (historical rows)', () => {
    const mission = [step('third'), step('first', 1), step('second', 2)];
    expect(orderMissionSteps(mission).map((s) => s.title)).toEqual(['third', 'first', 'second']);
  });
});

describe('buildTelemetry past the target date', () => {
  const goal = {
    title: 'g',
    startDate: '2026-07-01',
    targetDate: '2026-09-01',
    estimatedMilestones: 5,
    completedMilestones: 0,
  };
  const milestone = {
    title: 'm',
    effortUnitDefinition: '1 step = one video',
    estimatedEffortUnits: 40,
    completedEffortUnits: 0,
    startDate: '2026-07-01',
    targetDate: '2026-07-21',
  };

  it('calls a zero-progress overdue milestone behind, not unknown', () => {
    const t = buildTelemetry(goal, milestone, '2026-08-02');
    expect(t.scheduleStatus).toBe('behind');
    expect(t.varianceDays).toBe(12);
  });

  it('reports days remaining as a signed overdue count', () => {
    expect(buildTelemetry(goal, milestone, '2026-08-02').daysRemaining).toBe(-12);
    expect(buildTelemetry(goal, milestone, '2026-07-21').daysRemaining).toBe(0);
    expect(buildTelemetry(goal, milestone, '2026-07-11').daysRemaining).toBe(10);
  });

  it('has no required daily pace once the target is gone', () => {
    expect(buildTelemetry(goal, milestone, '2026-08-02').requiredDailyUnits).toBeNull();
  });

  it('asks for everything remaining on the target day itself', () => {
    expect(buildTelemetry(goal, milestone, '2026-07-21').requiredDailyUnits).toBe(40);
  });

  it('spreads the remainder over the days actually left', () => {
    const t = buildTelemetry(
      goal,
      { ...milestone, completedEffortUnits: 20 },
      '2026-07-11',
    );
    expect(t.requiredDailyUnits).toBe(2);
  });

  it('is zero, not overdue, when the work is already done', () => {
    const t = buildTelemetry(
      goal,
      { ...milestone, completedEffortUnits: 40 },
      '2026-08-02',
    );
    expect(t.requiredDailyUnits).toBe(0);
  });
});

describe('computeGoalTrack', () => {
  it('counts progress in fractional milestones, not steps', () => {
    const track = computeGoalTrack({
      startDate: '2026-07-01',
      targetDate: '2026-12-19',
      estimatedMilestones: 7,
      completedMilestones: 2,
      currentMilestoneProgress: 0.4,
      today: '2026-07-21',
    });
    expect(track.milestonesDone).toBeCloseTo(2.4);
    expect(track.estimatedMilestones).toBe(7);
    expect(track.completedMilestones).toBe(2);
  });

  it('caps a milestone that overran its estimate at one whole milestone', () => {
    const track = computeGoalTrack({
      startDate: '2026-07-01',
      targetDate: '2026-12-19',
      estimatedMilestones: 3,
      completedMilestones: 2,
      currentMilestoneProgress: 1.8,
      today: '2026-07-21',
    });
    expect(track.milestonesDone).toBe(3);
  });

  it('reads the goal as behind while the milestone alone looks fine', () => {
    // "100 videos by December" chunked into 7 milestones of 15. One video shipped
    // on day two: comfortable against a 15-video chunk, nowhere near 100 by December.
    const goal = computeGoalTrack({
      startDate: '2026-07-23',
      targetDate: '2026-12-19',
      estimatedMilestones: 7,
      completedMilestones: 0,
      currentMilestoneProgress: 1 / 15,
      today: '2026-07-24',
    });
    expect(goal.scheduleStatus).toBe('behind');
    expect(goal.varianceDays).toBeGreaterThan(30);
    expect(goal.daysRemaining).toBe(148);
  });

  it('calls a goal behind once its own target has passed with nothing done', () => {
    const track = computeGoalTrack({
      startDate: '2026-07-01',
      targetDate: '2026-09-01',
      estimatedMilestones: 7,
      completedMilestones: 0,
      currentMilestoneProgress: 0,
      today: '2026-09-15',
    });
    expect(track.scheduleStatus).toBe('behind');
    expect(track.varianceDays).toBe(14);
    expect(track.daysRemaining).toBe(-14);
  });

  it('stays unknown until there is enough execution data', () => {
    const track = computeGoalTrack({
      startDate: '2026-07-23',
      targetDate: '2026-12-19',
      estimatedMilestones: 7,
      completedMilestones: 0,
      currentMilestoneProgress: 0,
      today: '2026-07-24',
    });
    expect(track.currentProjectedDate).toBeNull();
    expect(track.scheduleStatus).toBe('unknown');
    expect(track.varianceDays).toBeNull();
  });
});
