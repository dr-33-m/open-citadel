import type { Measurement } from 'samwell-shared';

/**
 * What counts as done.
 *
 * Its own module because both the occurrence engine (deciding whether a
 * flexible target has already been met today) and the consistency engine
 * (counting completions) need it, and putting it in either one would make the
 * two import each other.
 *
 * Pure: no React Native, no database, no stores. Imported relatively rather
 * than through `@/` so the vitest suites can load it without a path alias.
 */

/** The fields of a log this module needs. Deliberately not the DB row type. */
export type LogView = {
  /**
   * Three states, mirroring the column:
   *   1    — done, for a COMPLETION measurement
   *   null — done, and `value` carries the number
   *   0    — an explicit "this did not happen"
   */
  completed: number | null;
  value: number | null;
};

/**
 * Whether one log satisfies its trackable's measurement.
 *
 * An explicit "didn't happen" always loses, whatever value happens to sit
 * beside it — the user said it did not happen and that is the more
 * authoritative of the two facts.
 *
 * The comparison for value-carrying measurements is made HERE, at read time,
 * rather than stored. That is what keeps partial credit a future decision
 * rather than a future migration: `350` against a target of `500` is an
 * unmet log today, and if the target is edited to `300` tomorrow the same row
 * becomes met without anything being rewritten.
 */
export function isLogSatisfying(log: LogView, measurement: Measurement): boolean {
  if (log.completed === 0) return false;

  switch (measurement.type) {
    case 'COMPLETION':
      return log.completed === 1;

    // A rating has no target — every rating is a real answer, and treating a
    // low one as a failure would make the honest answer the costly one.
    case 'RATING':
      return log.value != null;

    case 'QUANTITY':
    case 'DURATION':
    case 'AMOUNT':
      return (log.value ?? 0) >= measurement.target;

    default:
      return false;
  }
}

/** Whether logging this measurement requires a number from the user. */
export function needsValue(measurement: Measurement): boolean {
  return measurement.type !== 'COMPLETION';
}

/**
 * The value a log control should open on.
 *
 * The target for the things where hitting it exactly is the common case, so
 * the usual log is one tap. Money is the exception: an amount is rarely
 * exactly the target, and prefilling one would make the default the data.
 */
export function defaultLogValue(measurement: Measurement): number | null {
  switch (measurement.type) {
    case 'QUANTITY':
    case 'DURATION':
      return measurement.target;
    case 'RATING':
      return null;
    case 'AMOUNT':
      return null;
    default:
      return null;
  }
}

/** `30 minutes`, `6 videos`, `1 to 5`, or nothing at all for a completion. */
export function measurementLabel(measurement: Measurement): string | null {
  switch (measurement.type) {
    case 'COMPLETION':
      return null;
    case 'RATING':
      return `${measurement.min} to ${measurement.max}`;
    default:
      return `${measurement.target} ${measurement.unit}`;
  }
}
