import { isLogSatisfying } from '@/services/measurement';
import {
  expandOccurrences,
  isFlexible,
  isPausedOn,
  type LogView,
  type TrackableView,
} from '@/services/occurrences';
import {
  endOfMonthYmd,
  endOfWeekYmd,
  startOfMonthYmd,
  startOfWeekYmd,
  ymdRange,
  type Ymd,
} from '@/utils/day';

/**
 * What a day in the planner is saying about one trackable.
 *
 * `expected` covers today and the future on a FIXED schedule: something is
 * owed on this day and there is still time. `missed` is a fixed day that came
 * and went. `flexible` is a day under a WEEKLY_TARGET / MONTHLY_TARGET
 * schedule with nothing logged — no particular day is owed, so it is neither
 * due nor missed; it just carries where the period stands.
 */
export type DayStatus = 'done' | 'missed' | 'expected' | 'flexible';

export type PlannerCell = {
  id: string;
  date: Ymd;
  trackableId: string;
  title: string;
  timeOfDay: string | null;
  status: DayStatus;
  /** What was logged, when something was: "45 minutes", "4 videos". For a
   *  `flexible` day with nothing logged, where the period stands: "2 of 6
   *  this week". */
  detail: string | null;
  note: string | null;
};

function logDetail(log: LogView, trackable: TrackableView): string | null {
  if (log.value == null) return null;
  const { measurement } = trackable;
  if (measurement.type === 'RATING') return `${log.value} of ${measurement.max}`;
  if (measurement.type === 'COMPLETION') return null;
  return `${log.value} ${measurement.unit}`;
}

function isLiveOn(trackable: TrackableView, date: Ymd): boolean {
  if (trackable.status !== 'ACTIVE') return false;
  if (date < trackable.startDate || date > trackable.endDate) return false;
  return !isPausedOn(date, trackable.pauses);
}

/**
 * Every trackable's month, day by day.
 *
 * Fixed schedules contribute one cell per expected day, so an empty Tuesday
 * that should have happened reads as missed once it is past.
 *
 * Flexible schedules ("six videos a week") have no day they can be said to
 * have missed, so they never draw red. But they still contribute a cell for
 * every day the trackable is live — a logged day shows what happened, an
 * unlogged one carries the week's tally — so a flexible-only goal is not a
 * blank calendar.
 */
export function buildPlannerCells(
  monthAnchor: Ymd,
  trackables: TrackableView[],
  logsByTrackable: Map<string, LogView[]>,
  today: Ymd,
): PlannerCell[] {
  const from = startOfMonthYmd(monthAnchor);
  const to = endOfMonthYmd(monthAnchor);
  const cells: PlannerCell[] = [];

  for (const trackable of trackables) {
    const logs = (logsByTrackable.get(trackable.id) ?? []).filter(
      (log) => log.date >= from && log.date <= to,
    );
    const logsByDate = new Map<Ymd, LogView>();
    for (const log of logs) {
      // The last log of a day is the one the day reads as.
      logsByDate.set(log.date, log);
    }

    if (isFlexible(trackable.schedule)) {
      cells.push(...flexibleCells(trackable, logsByTrackable.get(trackable.id) ?? [], logsByDate, from, to));
      continue;
    }

    const days = expandOccurrences({
      schedule: trackable.schedule,
      startDate: trackable.startDate,
      endDate: trackable.endDate,
      pauses: trackable.pauses,
      range: { from, to },
    });

    for (const date of days) {
      const log = logsByDate.get(date);
      const status: DayStatus = log
        ? isLogSatisfying(log, trackable.measurement)
          ? 'done'
          : 'missed'
        : date < today
          ? 'missed'
          : 'expected';

      cells.push({
        id: `${trackable.id}:${date}`,
        date,
        trackableId: trackable.id,
        title: trackable.title,
        timeOfDay: trackable.timeOfDay,
        status,
        detail: log ? logDetail(log, trackable) : null,
        note: log?.note ?? null,
      });
    }
  }

  return cells;
}

/**
 * A flexible trackable's month: a cell for every live day, and the week (or
 * month) tally on the ones with nothing logged.
 *
 * The tally uses the schedule's own number — "of 6" — not the pro-rated
 * period target the consistency engine works in. The reader set six a week;
 * that is the number they should see on the calendar.
 */
function flexibleCells(
  trackable: TrackableView,
  allLogs: LogView[],
  logsByDate: Map<Ymd, LogView>,
  from: Ymd,
  to: Ymd,
): PlannerCell[] {
  if (!isFlexible(trackable.schedule)) return [];

  const monthly = trackable.schedule.type === 'MONTHLY_TARGET';
  const target = trackable.schedule.target;
  const periodLabel = monthly ? 'THIS MONTH' : 'THIS WEEK';
  const cells: PlannerCell[] = [];

  // How many satisfying logs sit in the period `date` belongs to, cached so a
  // week is not recounted seven times.
  const doneByPeriodStart = new Map<Ymd, number>();
  const doneInPeriodOf = (date: Ymd): number => {
    const periodFrom = monthly ? startOfMonthYmd(date) : startOfWeekYmd(date);
    const cached = doneByPeriodStart.get(periodFrom);
    if (cached !== undefined) return cached;
    const periodTo = monthly ? endOfMonthYmd(date) : endOfWeekYmd(date);
    const count = allLogs.filter(
      (log) =>
        log.date >= periodFrom &&
        log.date <= periodTo &&
        isLogSatisfying(log, trackable.measurement),
    ).length;
    doneByPeriodStart.set(periodFrom, count);
    return count;
  };

  for (const date of ymdRange(from, to)) {
    if (!isLiveOn(trackable, date)) continue;
    const log = logsByDate.get(date);

    if (log) {
      cells.push({
        id: `${trackable.id}:${date}`,
        date,
        trackableId: trackable.id,
        title: trackable.title,
        timeOfDay: trackable.timeOfDay,
        // Still never red: a flexible schedule has no missed day. A log that
        // did not meet its measurement is just not a `done`.
        status: isLogSatisfying(log, trackable.measurement) ? 'done' : 'flexible',
        detail: logDetail(log, trackable),
        note: log.note ?? null,
      });
      continue;
    }

    cells.push({
      id: `${trackable.id}:${date}`,
      date,
      trackableId: trackable.id,
      title: trackable.title,
      timeOfDay: trackable.timeOfDay,
      status: 'flexible',
      detail: `${doneInPeriodOf(date)} of ${target} ${periodLabel}`,
      note: null,
    });
  }

  return cells;
}

/** Timed first in clock order, untimed at the bottom. Matches the deck. */
export function byTimeThenTitle(a: PlannerCell, b: PlannerCell): number {
  if (a.timeOfDay && b.timeOfDay && a.timeOfDay !== b.timeOfDay) {
    return a.timeOfDay < b.timeOfDay ? -1 : 1;
  }
  if (a.timeOfDay && !b.timeOfDay) return -1;
  if (!a.timeOfDay && b.timeOfDay) return 1;
  return a.title.localeCompare(b.title);
}
