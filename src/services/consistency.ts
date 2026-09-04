import { isLogSatisfying } from './measurement';
import {
  expandOccurrences,
  expandPeriods,
  scheduleKind,
  type DateRange,
  type LogView,
  type ScheduleKind,
  type TrackableView,
} from './occurrences';
import type { Ymd } from '../utils/day';

/**
 * How reliably the user did what they said they would.
 *
 * Derived on every read, never stored. A stored score is a score that can
 * disagree with the rows it came from, and this number is a claim about
 * someone's own discipline — it has to be recomputable from the logs at any
 * moment, or it is not worth showing.
 *
 * There are no streaks here, and there is no `streak` field to add one to.
 * Consistency is a ratio of what was done to what was due; a missed day is a
 * missed day, not a broken chain, and the difference matters because a chain
 * punishes the day after a miss as well as the miss itself.
 *
 * Pure: no React Native, no database, no stores.
 */

export { isLogSatisfying } from './measurement';

export type PeriodResult = {
  key: string;
  from: Ymd;
  to: Ymd;
  target: number;
  done: number;
  /** Never null: `expandPeriods` drops any period whose target rounds to zero. */
  ratio: number;
  /**
   * The period's last day has not arrived yet. What was done in it is shown,
   * but it is left out of the aggregate `expected`/`completed`/`ratio` — you
   * cannot be behind on a week you are still in.
   */
  inProgress: boolean;
};

export type ConsistencyResult = {
  trackableId: string;
  title: string;
  kind: ScheduleKind;
  expected: number;
  completed: number;
  /** Satisfying logs beyond what was asked for. Never inflates `ratio`. */
  bonus: number;
  /** 0..1, or null when nothing has been expected yet. */
  ratio: number | null;
  /** Scheduled days that came and went unmet. Fixed schedules only. */
  missed: Ymd[];
  /** Per-period detail, so the UI can show 5/6 as well as the aggregate. */
  periods: PeriodResult[];
};

export type ConsistencyInput = {
  trackable: TrackableView;
  logs: LogView[];
  range: DateRange;
  /**
   * The real current day. A scheduled day or a flexible period is scored only
   * once it has fully passed — strictly before this — because a day still in
   * progress is neither met nor missed, and counting it makes a goal set this
   * morning read as 0% by lunchtime. A day the user has already logged counts
   * now, whatever they logged.
   *
   * Omit it and nothing is treated as in progress (the whole range scores).
   * Production always passes it; some unit tests over historical windows do
   * not need it.
   */
  today?: Ymd;
};

/**
 * `null`, not `0`, when nothing was expected.
 *
 * A goal created this morning is not 0% consistent, and showing 0% on day one
 * is the most demoralising thing this feature could do to someone on the day
 * they decided to try.
 */
function ratioOf(completed: number, expected: number): number | null {
  return expected === 0 ? null : completed / expected;
}

export function fixedConsistency(input: ConsistencyInput): ConsistencyResult {
  const { trackable, logs, range, today } = input;

  const occurrences = expandOccurrences({
    schedule: trackable.schedule,
    startDate: trackable.startDate,
    endDate: trackable.endDate,
    pauses: trackable.pauses,
    range,
  });
  const scheduled = new Set(occurrences);

  const inRange = logs.filter((log) => log.date >= range.from && log.date <= range.to);
  // Every day the user has already answered for, by either kind of answer.
  const answered = new Set(inRange.map((log) => log.date));

  const byDate = new Map<Ymd, number>();
  for (const log of inRange) {
    if (isLogSatisfying(log, trackable.measurement)) {
      byDate.set(log.date, (byDate.get(log.date) ?? 0) + 1);
    }
  }

  let expected = 0;
  let completed = 0;
  let bonus = 0;
  const missed: Ymd[] = [];

  for (const date of occurrences) {
    // A day is settled once it is over, or once the user has logged it. An
    // untouched day that is still today is not a miss yet.
    const settled = today === undefined || date < today || answered.has(date);
    if (!settled) continue;

    expected += 1;
    const count = byDate.get(date) ?? 0;
    if (count > 0) {
      // One scheduled day can only be met once. Doing it twice on a Tuesday
      // does not make up for Wednesday, so the extra is bonus, not a second
      // completion — which is also what keeps `ratio` bounded at 1.
      completed += 1;
      bonus += count - 1;
    } else {
      missed.push(date);
    }
  }

  // Logs on days nothing was scheduled are real and worth keeping, but they
  // are not evidence of following a schedule, so they stay out of the ratio.
  for (const [date, count] of byDate) {
    if (!scheduled.has(date)) bonus += count;
  }

  return {
    trackableId: trackable.id,
    title: trackable.title,
    kind: 'fixed',
    expected,
    completed,
    bonus,
    ratio: ratioOf(completed, expected),
    missed,
    periods: [],
  };
}

export function flexibleConsistency(input: ConsistencyInput): ConsistencyResult {
  const { trackable, logs, range, today } = input;

  const periods = expandPeriods({
    schedule: trackable.schedule,
    startDate: trackable.startDate,
    endDate: trackable.endDate,
    pauses: trackable.pauses,
    range,
  });

  let expected = 0;
  let completed = 0;
  let bonus = 0;
  const results: PeriodResult[] = [];

  for (const period of periods) {
    const count = logs.filter(
      (log) =>
        log.date >= period.from &&
        log.date <= period.to &&
        isLogSatisfying(log, trackable.measurement),
    ).length;

    // Eight videos in a six-video week is a six-video week, and two spare.
    const done = Math.min(count, period.target);

    // The week you are still in shows what you have done but is not yet part
    // of the ratio: six-a-week means you have until Sunday, so nothing about
    // Thursday is a shortfall.
    const inProgress = today !== undefined && period.to >= today;
    if (!inProgress) {
      expected += period.target;
      completed += done;
      bonus += count - done;
    }

    results.push({
      key: period.key,
      from: period.from,
      to: period.to,
      target: period.target,
      done,
      ratio: done / period.target,
      inProgress,
    });
  }

  return {
    trackableId: trackable.id,
    title: trackable.title,
    kind: 'flexible',
    expected,
    completed,
    bonus,
    ratio: ratioOf(completed, expected),
    // A flexible schedule has no missed *days* — that is the entire point of
    // it. Tuesday with nothing logged is not a failure if the week ends at 6.
    missed: [],
    periods: results,
  };
}

export function trackableConsistency(input: ConsistencyInput): ConsistencyResult {
  return scheduleKind(input.trackable.schedule) === 'flexible'
    ? flexibleConsistency(input)
    : fixedConsistency(input);
}

export type GoalExecution = {
  expected: number;
  completed: number;
  ratio: number | null;
  /** Per-trackable detail, worst first, so the UI can name the weak link. */
  breakdown: ConsistencyResult[];
};

/**
 * Execution across a goal, weighted by expected occurrences.
 *
 * Not the mean of the per-trackable ratios. Averaging those gives a
 * once-a-month trackable the same say as a daily one, so missing the single
 * monthly review would drag a perfect month of daily work from 100% to 50%.
 * Summing the numerators and denominators instead asks the honest question:
 * of everything that was due, how much got done.
 */
export function goalExecution(results: ConsistencyResult[]): GoalExecution {
  let expected = 0;
  let completed = 0;
  for (const result of results) {
    expected += result.expected;
    completed += result.completed;
  }

  const breakdown = [...results].sort((a, b) => {
    if (a.ratio === null) return 1;
    if (b.ratio === null) return -1;
    return a.ratio - b.ratio;
  });

  return { expected, completed, ratio: ratioOf(completed, expected), breakdown };
}

export type GoalOutcome = { value: number; target: number; unit: string };
/**
 * Progress toward the goal's numeric outcome, which is a different fact from
 * execution and is never averaged with it. You can be 92% consistent and a
 * quarter of the way to $4,000; both are true and neither explains the other.
 *
 * Sums raw values from every trackable measured in the goal's own unit,
 * regardless of whether each log met its own target — 3 of 6 videos still
 * earned whatever they earned.
 */
export function goalOutcome(
  goal: { outcomeTarget: number | null; outcomeUnit: string | null },
  trackables: TrackableView[],
  logsByTrackable: Map<string, LogView[]>,
): GoalOutcome | null {
  if (goal.outcomeTarget == null || goal.outcomeUnit == null) return null;

  const unit = goal.outcomeUnit.toLowerCase();
  let value = 0;

  for (const trackable of trackables) {
    const { measurement } = trackable;
    if (measurement.type === 'COMPLETION' || measurement.type === 'RATING') continue;
    if (measurement.unit.toLowerCase() !== unit) continue;

    for (const log of logsByTrackable.get(trackable.id) ?? []) {
      if (log.completed === 0) continue;
      value += log.value ?? 0;
    }
  }

  return { value, target: goal.outcomeTarget, unit: goal.outcomeUnit };
}

/** The primary goal being out-executed by a side goal, and by which one. */
export type LeanSignal = {
  /** The side goal that is ahead. */
  leaderId: string;
  leaderRatio: number;
  primaryRatio: number;
};

/**
 * Whether a side goal is running ahead of the primary, and which one leads.
 *
 * One comparison, in one place, because two surfaces nudge on it: the overview
 * sheet prints a line and Samwell's status carries a lean signal, and the two
 * had better agree about when the primary is trailing. The leader is the BEST
 * non-primary execution, measured on the same weighted ratio the goal's own
 * number uses; a goal with nothing expected yet cannot lead, because an
 * unmeasured goal is not ahead of anything. Dead even is not trailing.
 */
export function leanSignal(
  primary: GoalExecution | null,
  others: readonly { id: string; execution: GoalExecution | null }[],
): LeanSignal | null {
  const primaryRatio = primary?.ratio;
  if (primaryRatio == null) return null;

  let leader: { id: string; ratio: number } | null = null;
  for (const other of others) {
    const ratio = other.execution?.ratio;
    if (ratio == null || ratio <= primaryRatio) continue;
    if (leader == null || ratio > leader.ratio) leader = { id: other.id, ratio };
  }

  return leader == null
    ? null
    : { leaderId: leader.id, leaderRatio: leader.ratio, primaryRatio };
}
