import {
  expandOccurrences,
  isFlexible,
  type LogView,
  type TrackableView,
} from '@/services/occurrences';
import { addDaysYmd, daysBetween, type Ymd } from '@/utils/day';

/** One point on the pace chart: a month, what was banked, what was owed. */
export type OutcomePoint = {
  /**
   * The axis label: `3 SEP`.
   *
   * The day as well as the month, because the axis thins itself to a handful
   * of ticks and two of them landing in one month printed `OCT` twice with no
   * way to tell which was which.
   */
  label: string;
  /** Everything logged up to the end of this month. Null once the month is in
   *  the future, so the line stops at today rather than flattening forward. */
  actual: number | null;
  /** Where following the schedule exactly would have you by now. */
  pace: number;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * How long a run still gets a point per day.
 *
 * Points are evenly spaced in TIME, which is what keeps the reference line
 * straight: the chart lays its points out by index, so a series a month apart
 * at one end and two days apart at the other bends an even pace into a curve.
 * A day per point up to about a year, then a week, so a five-year goal is a
 * few hundred points rather than two thousand.
 */
const MAX_DAILY_SPAN = 400;

/**
 * A goal's outcome over its whole run: what has actually been banked, month by
 * month, against the straight line that reaches the target on the last day.
 *
 * This answers the one question the Insights view could not. The outcome ring
 * says "2 of 100" and stops there, which is a fact with no verdict attached —
 * 2 of 100 is fine in week one and a disaster in week eleven, and only the
 * clock can tell those apart. The gap between the two lines IS the verdict.
 *
 * The pace line is shaped by the schedule rather than drawn straight, because
 * it is read as "the line I have to reproduce" and a straight one asks for
 * ground on days nothing is due. A weekday-only goal's ideal is flat across
 * every weekend and steps up on the days it actually owes something; the
 * target is spread over the occurrences, not over the calendar.
 *
 * A flexible target ("six times a week") owes no particular day, so it is the
 * one case that genuinely is spread evenly across the days it is live.
 *
 * Counts logs the same way `goalOutcome` does — the goal's own unit only, and
 * an explicit miss contributes nothing — so the last actual point always
 * agrees with the number on the outcome card beside it. Two charts on one card
 * disagreeing about the same total is the bug this shape exists to avoid.
 */
export function buildOutcomeSeries(
  goal: {
    startDate: Ymd;
    endDate: Ymd;
    outcomeTarget: number | null;
    outcomeUnit: string | null;
  },
  trackables: TrackableView[],
  logsByTrackable: Map<string, LogView[]>,
  today: Ymd,
): OutcomePoint[] {
  if (goal.outcomeTarget == null || goal.outcomeUnit == null) return [];
  const span = daysBetween(goal.startDate, goal.endDate);
  if (span <= 0) return [];

  const unit = goal.outcomeUnit.toLowerCase();
  const banked = new Map<Ymd, number>();
  // Same rule as `goalOutcome`: an outcome no trackable is measured in cannot
  // be charted, and a flat line along the bottom of a card is the most
  // discouraging way to say "nobody wired this up".
  let fed = false;
  for (const trackable of trackables) {
    const { measurement } = trackable;
    if (measurement.type === 'COMPLETION' || measurement.type === 'RATING') continue;
    if (measurement.unit.toLowerCase() !== unit) continue;
    fed = true;
    for (const log of logsByTrackable.get(trackable.id) ?? []) {
      if (log.completed === 0) continue;
      banked.set(log.date, (banked.get(log.date) ?? 0) + (log.value ?? 0));
    }
  }

  if (!fed) return [];

  /*
   * What each day of the run is expected to add, so the ideal line can be
   * shaped like the schedule instead of drawn straight through it.
   *
   * Weights rather than values: the goal's target is spread across them at the
   * end, so the line always lands exactly on the target however the schedule
   * and the trackables' own targets happen to add up.
   */
  const weight = new Map<Ymd, number>();
  let totalWeight = 0;
  const addWeight = (date: Ymd, amount: number) => {
    if (amount <= 0 || date < goal.startDate || date > goal.endDate) return;
    weight.set(date, (weight.get(date) ?? 0) + amount);
    totalWeight += amount;
  };

  for (const trackable of trackables) {
    const { measurement, schedule } = trackable;
    if (measurement.type === 'COMPLETION' || measurement.type === 'RATING') continue;
    if (measurement.unit.toLowerCase() !== unit) continue;

    if (isFlexible(schedule)) {
      // No day is owed, so every live day carries an equal share of the
      // period's target. This is the one schedule an even spread is true for.
      const perDay =
        schedule.type === 'MONTHLY_TARGET'
          ? (measurement.target * schedule.target) / 30
          : (measurement.target * schedule.target) / 7;
      const from = trackable.startDate > goal.startDate ? trackable.startDate : goal.startDate;
      const to = trackable.endDate < goal.endDate ? trackable.endDate : goal.endDate;
      for (let i = 0; i <= daysBetween(from, to); i += 1) addWeight(addDaysYmd(from, i), perDay);
      continue;
    }

    for (const date of expandOccurrences({
      schedule,
      startDate: trackable.startDate,
      endDate: trackable.endDate,
      pauses: trackable.pauses,
      range: { from: goal.startDate, to: goal.endDate },
    })) {
      addWeight(date, measurement.target);
    }
  }

  // Walked once, accumulating as it goes, so the whole series costs one pass
  // rather than a scan of the logs per point.
  const step = span <= MAX_DAILY_SPAN ? 1 : 7;
  const points: OutcomePoint[] = [];
  let running = 0;
  let owed = 0;
  let nextPoint = 0;

  for (let elapsed = 0; elapsed <= span; elapsed += 1) {
    const date = addDaysYmd(goal.startDate, elapsed);
    running += banked.get(date) ?? 0;
    owed += weight.get(date) ?? 0;
    // The last day always gets a point, so the reference lands exactly on the
    // target rather than stopping short of it.
    if (elapsed !== nextPoint && elapsed !== span) continue;
    if (elapsed === nextPoint) nextPoint += step;

    points.push({
      label: `${Number(date.split('-')[2])} ${MONTHS[Number(date.split('-')[1]) - 1] ?? ''}`,
      // A date in the future has nothing to report, and a line that carried
      // the last value forward would read as a prediction the app has not
      // made. The gold line simply stops at today.
      actual: date <= today ? running : null,
      // Nothing scheduled at all — every trackable flexible and none live, or
      // a goal whose number no trackable feeds — falls back to the calendar,
      // which is the only reference left.
      pace:
        totalWeight > 0
          ? Math.round((goal.outcomeTarget * owed) / totalWeight)
          : Math.round((goal.outcomeTarget * elapsed) / span),
    });
  }

  return points;
}
