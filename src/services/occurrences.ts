import type { LifecycleStatus, Measurement, Schedule } from 'samwell-shared';

import {
  addDaysYmd,
  dayOfWeek,
  daysBetween,
  endOfMonthYmd,
  endOfWeekYmd,
  isoWeekKey,
  maxYmd,
  minYmd,
  monthKey,
  startOfMonthYmd,
  startOfWeekYmd,
  type Ymd,
} from '../utils/day';
import { isLogSatisfying, type LogView as SatisfiableLog } from './measurement';

/**
 * When a trackable is expected.
 *
 * Occurrences are DERIVED, always. They are a pure function of
 * `(startDate, endDate, schedule, pauses)`, and nothing here is ever written
 * to the database. A materialized occurrence table would have to be
 * invalidated on every schedule edit, pause, resume and date change, and a
 * stale row in a consistency denominator is a wrong number shown to someone
 * about their own discipline — the worst thing this feature could get wrong.
 * Five trackables over a six-month horizon is under a thousand strings, which
 * is comfortably inside a frame; memoise in the store if that ever stops being
 * true.
 *
 * Pure: no React Native, no database, no stores.
 *
 * ## Fixed and flexible are different questions
 *
 * DAILY, WEEKLY_DAYS, SPECIFIC_DATES and INTERVAL name the *days* on which
 * something is expected, so they expand to a list of dates and each date is
 * either met or missed.
 *
 * WEEKLY_TARGET and MONTHLY_TARGET name a *count* per period and say nothing
 * about which days. Expanding those to dates is the mistake that turns "six
 * videos a week" into a Tuesday failure, so they expand to periods instead.
 */

export type PauseWindow = { startDate: Ymd; endDate: Ymd | null };

export type DateRange = { from: Ymd; to: Ymd };

export type Period = {
  /** `2026-W37` or `2026-03`. Stable and sortable. */
  key: string;
  from: Ymd;
  to: Ymd;
  /** How many completions this period expects, pro-rated for a partial one. */
  target: number;
};

export type ScheduleKind = 'fixed' | 'flexible';

export type TrackableView = {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  /** `HH:MM`, or null. Orders the planner's day list; never gates a log. */
  timeOfDay: string | null;
  startDate: Ymd;
  endDate: Ymd;
  status: LifecycleStatus;
  schedule: Schedule;
  measurement: Measurement;
  pauses: PauseWindow[];
};

export type LogView = SatisfiableLog & {
  id: string;
  trackableId: string;
  date: Ymd;
  note: string | null;
};

export type ExpandInput = {
  schedule: Schedule;
  startDate: Ymd;
  endDate: Ymd;
  pauses: PauseWindow[];
  range: DateRange;
};

/** The two schedules that name a count per period rather than particular days. */
export type FlexibleSchedule = Extract<
  Schedule,
  { type: 'WEEKLY_TARGET' | 'MONTHLY_TARGET' }
>;

/**
 * A type predicate rather than a comparison against `scheduleKind`, so the
 * compiler narrows `schedule` to the variants that actually carry a `target`.
 */
export function isFlexible(schedule: Schedule): schedule is FlexibleSchedule {
  return schedule.type === 'WEEKLY_TARGET' || schedule.type === 'MONTHLY_TARGET';
}

export function scheduleKind(schedule: Schedule): ScheduleKind {
  return isFlexible(schedule) ? 'flexible' : 'fixed';
}

/**
 * A pause with no end is open — it runs to whenever "now" is, which is why the
 * comparison is one-sided rather than defaulting `endDate` to today. A module
 * that has no clock cannot be surprised by one.
 */
export function isPausedOn(day: Ymd, pauses: PauseWindow[]): boolean {
  for (const pause of pauses) {
    if (day < pause.startDate) continue;
    if (pause.endDate === null || day <= pause.endDate) return true;
  }
  return false;
}

/** The trackable's own window, clipped to the range being asked about. */
export function activeWindow(
  startDate: Ymd,
  endDate: Ymd,
  range: DateRange,
): DateRange | null {
  if (endDate < startDate) return null;
  const from = maxYmd(startDate, range.from);
  const to = minYmd(endDate, range.to);
  return to < from ? null : { from, to };
}

/** Days in a window that are not paused. */
function availableDays(window: DateRange, pauses: PauseWindow[]): number {
  const span = daysBetween(window.from, window.to);
  if (span < 0) return 0;
  let count = 0;
  for (let i = 0; i <= span; i += 1) {
    if (!isPausedOn(addDaysYmd(window.from, i), pauses)) count += 1;
  }
  return count;
}

/**
 * The days a FIXED schedule expects, within the range. Sorted and deduped.
 *
 * Returns `[]` for a flexible schedule rather than throwing: callers routinely
 * hold a mixed list and an empty answer is the honest one — a weekly target
 * expects no particular day.
 */
export function expandOccurrences(input: ExpandInput): Ymd[] {
  const { schedule, startDate, endDate, pauses, range } = input;
  if (scheduleKind(schedule) === 'flexible') return [];

  const window = activeWindow(startDate, endDate, range);
  if (!window) return [];

  const out: Ymd[] = [];

  switch (schedule.type) {
    case 'DAILY': {
      const span = daysBetween(window.from, window.to);
      for (let i = 0; i <= span; i += 1) out.push(addDaysYmd(window.from, i));
      break;
    }

    case 'WEEKLY_DAYS': {
      const wanted = new Set(schedule.daysOfWeek);
      const span = daysBetween(window.from, window.to);
      for (let i = 0; i <= span; i += 1) {
        const day = addDaysYmd(window.from, i);
        if (wanted.has(dayOfWeek(day))) out.push(day);
      }
      break;
    }

    case 'SPECIFIC_DATES': {
      for (const date of schedule.dates) {
        if (date >= window.from && date <= window.to) out.push(date);
      }
      break;
    }

    case 'INTERVAL': {
      // The lattice is anchored at the trackable's OWN start, not at the
      // window: which days are expected must not depend on what range someone
      // happened to ask about.
      const step = schedule.intervalDays;
      const offsetToWindow = daysBetween(startDate, window.from);
      let k = Math.max(0, Math.ceil(offsetToWindow / step));
      for (;;) {
        const day = addDaysYmd(startDate, k * step);
        if (day > window.to) break;
        if (day >= window.from) out.push(day);
        k += 1;
      }
      break;
    }
  }

  const unpaused = out.filter((day) => !isPausedOn(day, pauses));
  return Array.from(new Set(unpaused)).sort();
}

/**
 * The periods a FLEXIBLE schedule expects, within the range.
 *
 * A partial period gets a PRO-RATED target: a goal that starts on a Thursday
 * does not owe six videos in its first four days, and charging it six makes
 * the first week a guaranteed failure before the user has done anything wrong.
 * The same arithmetic covers the last period of a goal and any period a pause
 * cuts into.
 *
 * The pro-rating is computed against the trackable's active window, NOT
 * against the range being queried — otherwise asking about a single day would
 * shrink that week's target to a seventh of itself.
 */
export function expandPeriods(input: ExpandInput): Period[] {
  const { schedule, startDate, endDate, pauses, range } = input;
  if (!isFlexible(schedule)) return [];
  if (endDate < startDate) return [];

  const visible = activeWindow(startDate, endDate, range);
  if (!visible) return [];

  const weekly = schedule.type === 'WEEKLY_TARGET';
  const periods: Period[] = [];

  let cursor = weekly ? startOfWeekYmd(visible.from) : startOfMonthYmd(visible.from);

  while (cursor <= visible.to) {
    const periodFrom = cursor;
    const periodTo = weekly ? endOfWeekYmd(cursor) : endOfMonthYmd(cursor);

    // Clip to the trackable's life, not to the query, so the target is stable.
    const activeFrom = maxYmd(periodFrom, startDate);
    const activeTo = minYmd(periodTo, endDate);

    if (activeTo >= activeFrom) {
      const periodDays = daysBetween(periodFrom, periodTo) + 1;
      const available = availableDays({ from: activeFrom, to: activeTo }, pauses);
      const target =
        available >= periodDays
          ? schedule.target
          : Math.round((schedule.target * available) / periodDays);

      // A period the user was present for so briefly that it rounds to zero is
      // not a period they can fail.
      if (target > 0) {
        periods.push({
          key: weekly ? isoWeekKey(periodFrom) : monthKey(periodFrom),
          from: periodFrom,
          to: periodTo,
          target,
        });
      }
    }

    cursor = weekly ? addDaysYmd(periodTo, 1) : startOfMonthYmd(addDaysYmd(periodTo, 1));
  }

  return periods;
}

// ── What the deck asks for ───────────────────────────────────────────────────

export type DueItem = {
  trackable: TrackableView;
  /** Satisfying logs already made in the current period. Flexible only. */
  periodDone: number;
  /** The period's target, or 1 for a fixed schedule's single expected day. */
  periodTarget: number;
  /** `3 OF 6 THIS WEEK`, or null when the schedule has nothing to count. */
  periodLabel: string | null;
};

function isLive(trackable: TrackableView, day: Ymd): boolean {
  if (trackable.status !== 'ACTIVE') return false;
  if (day < trackable.startDate || day > trackable.endDate) return false;
  return !isPausedOn(day, trackable.pauses);
}

/**
 * What is still owed on `day`.
 *
 * ANY log for today removes the card, whatever it said — done, or an explicit
 * "didn't happen". The deck asks one question ("what happened with this
 * today?") and the user has answered it; putting the card back is asking the
 * same question twice.
 *
 * That rule has to be uniform across both schedule kinds, and getting it wrong
 * for the flexible ones is a real trap: an explicit miss correctly does not
 * count toward six-a-week, so testing only the period target leaves the card
 * sitting in the deck after the user has just told you it did not happen.
 *
 * A flexible trackable ALSO drops off once its period target has been met,
 * even on a day it has not been touched — six of six is done for the week.
 */
export function dueOn(
  day: Ymd,
  trackables: TrackableView[],
  logsByTrackable: Map<string, LogView[]>,
): DueItem[] {
  const items: DueItem[] = [];

  for (const trackable of trackables) {
    if (!isLive(trackable, day)) continue;

    const logs = logsByTrackable.get(trackable.id) ?? [];
    // Answered today, by either kind of answer.
    if (logs.some((log) => log.date === day)) continue;

    if (scheduleKind(trackable.schedule) === 'fixed') {
      const expected = expandOccurrences({
        schedule: trackable.schedule,
        startDate: trackable.startDate,
        endDate: trackable.endDate,
        pauses: trackable.pauses,
        range: { from: day, to: day },
      });
      if (expected.length === 0) continue;

      items.push({ trackable, periodDone: 0, periodTarget: 1, periodLabel: null });
      continue;
    }

    const [period] = expandPeriods({
      schedule: trackable.schedule,
      startDate: trackable.startDate,
      endDate: trackable.endDate,
      pauses: trackable.pauses,
      range: { from: day, to: day },
    });
    if (!period) continue;

    const done = logs.filter(
      (log) =>
        log.date >= period.from &&
        log.date <= period.to &&
        isLogSatisfying(log, trackable.measurement),
    ).length;
    if (done >= period.target) continue;

    items.push({
      trackable,
      periodDone: done,
      periodTarget: period.target,
      periodLabel: `${done} OF ${period.target} THIS ${
        trackable.schedule.type === 'WEEKLY_TARGET' ? 'WEEK' : 'MONTH'
      }`,
    });
  }

  return items.sort(byTimeThenTitle);
}

/**
 * Timed trackables first, in clock order; untimed ones fall to the bottom.
 * This is the order the planner's day dialog reads in, and the deck deals in.
 */
export function byTrackableTime(a: TrackableView, b: TrackableView): number {
  const at = a.timeOfDay;
  const bt = b.timeOfDay;
  if (at && bt && at !== bt) return at < bt ? -1 : 1;
  if (at && !bt) return -1;
  if (!at && bt) return 1;
  return a.title.localeCompare(b.title);
}

/**
 * The same order over due items.
 *
 * Split from {@link byTrackableTime} so callers that hold plain trackables can
 * sort without inventing a `DueItem` around each one purely to satisfy the
 * comparator.
 */
export function byTimeThenTitle(a: DueItem, b: DueItem): number {
  return byTrackableTime(a.trackable, b.trackable);
}

/** A human reading of a schedule, for a card's subtitle. */
export function scheduleSummary(schedule: Schedule): string {
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  switch (schedule.type) {
    case 'DAILY':
      return 'Every day';
    case 'WEEKLY_DAYS':
      return schedule.daysOfWeek.map((d) => DAYS[d]).join(' · ');
    case 'WEEKLY_TARGET':
      return `${schedule.target}× a week`;
    case 'MONTHLY_TARGET':
      return `${schedule.target}× a month`;
    case 'SPECIFIC_DATES':
      return `${schedule.dates.length} set ${schedule.dates.length === 1 ? 'date' : 'dates'}`;
    case 'INTERVAL':
      return `Every ${schedule.intervalDays} days`;
    default:
      return '';
  }
}
