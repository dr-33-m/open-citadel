import { isLogSatisfying } from '@/services/measurement';
import {
  expandOccurrences,
  isFlexible,
  type LogView,
  type TrackableView,
} from '@/services/occurrences';
import { endOfMonthYmd, startOfMonthYmd, type Ymd } from '@/utils/day';

/**
 * What a day in the planner is saying about one trackable.
 *
 * `expected` covers today and the future: something is owed and there is still
 * time. It is deliberately not the same as `missed`, because a day that has not
 * happened yet is not a failure and colouring it red would be the app telling
 * the reader off in advance.
 */
export type DayStatus = 'done' | 'missed' | 'expected';

export type PlannerCell = {
  id: string;
  date: Ymd;
  trackableId: string;
  title: string;
  timeOfDay: string | null;
  status: DayStatus;
  /** What was logged, when something was: "45 minutes", "4 videos". */
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

/**
 * Every trackable's month, day by day.
 *
 * Fixed schedules contribute one cell per expected day, so an empty Tuesday
 * that should have happened reads as missed once it is past.
 *
 * Flexible schedules contribute cells ONLY where something was actually
 * logged. This is the whole point of the flexible type: "six videos a week"
 * expects no particular day, so there is no day it can be said to have missed,
 * and drawing red on the days it did not happen would recreate exactly the
 * failure the schedule type exists to avoid.
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

    const days = isFlexible(trackable.schedule)
      ? [...logsByDate.keys()].sort()
      : expandOccurrences({
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

/** Timed first in clock order, untimed at the bottom. Matches the deck. */
export function byTimeThenTitle(a: PlannerCell, b: PlannerCell): number {
  if (a.timeOfDay && b.timeOfDay && a.timeOfDay !== b.timeOfDay) {
    return a.timeOfDay < b.timeOfDay ? -1 : 1;
  }
  if (a.timeOfDay && !b.timeOfDay) return -1;
  if (!a.timeOfDay && b.timeOfDay) return 1;
  return a.title.localeCompare(b.title);
}
