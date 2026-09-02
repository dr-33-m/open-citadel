/**
 * The arithmetic behind a calendar that scrolls instead of paging: which weeks
 * are reachable, where a week starts, and which month a week belongs to.
 *
 * Nothing here imports anything, for the same reason as `planner-entries`: the
 * tests run this file through `node --test` with type stripping rather than a
 * bundler, so an extensionless import of a sibling does not resolve.
 *
 * A week is seven days whatever calendar is in force, so all of this is plain
 * day arithmetic. Naming the month a week falls in is not, and is left to the
 * caller, which has the calendar system.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight, so two dates on the same day compare equal. */
function atMidnight(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Days added by the calendar rather than by milliseconds.
 *
 * A day is not always 24 hours — the ones a daylight-saving change falls on are
 * 23 or 25 — so stepping by `DAY_MS` drifts across a transition and lands a
 * week row an hour before or after midnight, which then reads as the wrong day.
 */
export function addDaysLocal(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return atMidnight(copy);
}

/** The first day of the week `date` falls in, for a week starting on `weekStartsOn`. */
export function startOfWeek(date: Date, weekStartsOn: number): Date {
  const start = ((weekStartsOn % 7) + 7) % 7;
  const midnight = atMidnight(date);
  const shift = (midnight.getDay() - start + 7) % 7;
  return addDaysLocal(midnight, -shift);
}

/**
 * The day a week is named after: its midpoint.
 *
 * A week straddling a month boundary belongs to whichever month holds most of
 * it, and the fourth day is the cheapest way to ask that — it is on the heavier
 * side by definition. Naming the week after its first day would put the last
 * week of January under December for as little as one day's overlap.
 */
export function weekAnchor(weekStart: Date): Date {
  return addDaysLocal(weekStart, 3);
}

/** The seven days of a week, in order. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_unused, day) => addDaysLocal(weekStart, day));
}

/**
 * Every week start from `weeksBefore` before the anchor's week to `weeksAfter`
 * after it, in order.
 *
 * A bounded range rather than an endless one: a scroller needs to know how tall
 * it is to place a scrollbar and to jump to a month without rendering its way
 * there, and neither is possible over an infinite list.
 */
export function weekRange(anchor: Date, weekStartsOn: number, weeksBefore: number, weeksAfter: number): Date[] {
  const first = startOfWeek(anchor, weekStartsOn);
  const before = Math.max(0, Math.trunc(weeksBefore));
  const after = Math.max(0, Math.trunc(weeksAfter));
  return Array.from({ length: before + after + 1 }, (_unused, step) =>
    addDaysLocal(first, (step - before) * 7)
  );
}

/**
 * Where `date`'s week sits in a range, or `-1`.
 *
 * Computed from the span rather than searched for, so jumping to a month costs
 * the same whether it is one screen away or a year.
 */
export function weekIndex(weeks: readonly Date[], date: Date, weekStartsOn: number): number {
  const first = weeks[0];
  if (!first) return -1;
  const target = startOfWeek(date, weekStartsOn);
  const index = Math.round((target.getTime() - first.getTime()) / (7 * DAY_MS));
  return index >= 0 && index < weeks.length ? index : -1;
}
