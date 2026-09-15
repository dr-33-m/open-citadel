/**
 * Time-of-day helpers for TimePicker.
 *
 * A time here is `{ hour, minute }` on a 24-hour clock, not a `Date`. A `Date`
 * cannot hold a time without also holding a day, so every caller with only a
 * time has to invent a date to carry it and strip it off again afterwards —
 * and the two conversions are where the daylight-saving bugs live. The pair of
 * numbers is the whole value, and `timeFromDate` / `timeToDate` are here for
 * the boundaries where a `Date` is genuinely what you have.
 *
 * Three rules hold throughout:
 *
 * - **`hour` is always 0–23**, whatever the picker is displaying. A 12-hour
 *   face is a rendering choice; storing 7pm as `{ hour: 7 }` with a separate
 *   meridiem flag means every comparison has to know about the flag.
 * - **Minutes wrap into hours, and hours wrap into the day.** Stepping forward
 *   from 23:45 gives 00:00, not 24:00, so arithmetic can never produce a time
 *   that does not exist.
 * - **Formatting goes through `Intl`, never through string concatenation.**
 *   Whether the meridiem is "PM", "pm" or absent entirely, and whether it
 *   leads or trails, belongs to the locale.
 */

/** A time of day. `hour` is 0–23 regardless of how it is displayed. */
export interface TimeValue {
  hour: number;
  minute: number;
}

/** Which face a time is written on. `24` drops the meridiem entirely. */
export type HourCycle = 12 | 24;

const MINUTES_PER_DAY = 24 * 60;

/** Minutes since midnight — the form every comparison here works in. */
export function timeToMinutes(value: TimeValue): number {
  return value.hour * 60 + value.minute;
}

/** The inverse, wrapping into the day so the result is always a real time. */
export function minutesToTime(minutes: number): TimeValue {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return { hour: Math.floor(wrapped / 60), minute: wrapped % 60 };
}

/** Negative if `a` is earlier, positive if later, `0` if the same time. */
export function compareTime(a: TimeValue, b: TimeValue): number {
  return timeToMinutes(a) - timeToMinutes(b);
}

export function isSameTime(
  a: TimeValue | null | undefined,
  b: TimeValue | null | undefined
): boolean {
  if (!a || !b) return false;
  return a.hour === b.hour && a.minute === b.minute;
}

/**
 * Holds a time inside a span, both ends inclusive and either one optional.
 *
 * Clamping rather than wrapping: a value outside the span is a value the
 * caller has been refused, and the nearest allowed time is the useful answer.
 */
export function clampTime(value: TimeValue, min?: TimeValue, max?: TimeValue): TimeValue {
  let minutes = timeToMinutes(value);
  if (min) minutes = Math.max(minutes, timeToMinutes(min));
  if (max) minutes = Math.min(minutes, timeToMinutes(max));
  return minutesToTime(minutes);
}

export function isTimeInRange(value: TimeValue, min?: TimeValue, max?: TimeValue): boolean {
  const minutes = timeToMinutes(value);
  if (min && minutes < timeToMinutes(min)) return false;
  if (max && minutes > timeToMinutes(max)) return false;
  return true;
}

/**
 * Rounds a time to the nearest multiple of `step` minutes.
 *
 * Rounding, not flooring: at a 30-minute step, 7:29 is a finger that stopped
 * just short of half past rather than someone asking for seven o'clock.
 */
export function roundToStep(value: TimeValue, step: number): TimeValue {
  if (step <= 1) return minutesToTime(timeToMinutes(value));
  return minutesToTime(Math.round(timeToMinutes(value) / step) * step);
}

/** Every time in the day at `step`-minute intervals, from midnight. */
export function timesOfDay(step: number): TimeValue[] {
  const safe = Math.max(1, Math.floor(step));
  const out: TimeValue[] = [];
  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += safe) {
    out.push(minutesToTime(minutes));
  }
  return out;
}

/** The hour as it is written on the face: 1–12, or 0–23. */
export function displayHour(hour: number, hourCycle: HourCycle): number {
  if (hourCycle === 24) return hour;
  const twelve = hour % 12;
  return twelve === 0 ? 12 : twelve;
}

/** Rebuilds a 0–23 hour from what the face shows and which half of the day. */
export function hourFromDisplay(
  displayed: number,
  meridiem: 'am' | 'pm',
  hourCycle: HourCycle
): number {
  if (hourCycle === 24) return displayed;
  const base = displayed % 12;
  return meridiem === 'pm' ? base + 12 : base;
}

export function meridiemOf(hour: number): 'am' | 'pm' {
  return hour < 12 ? 'am' : 'pm';
}

/**
 * The meridiem labels in the caller's locale, as `[am, pm]`.
 *
 * Read out of `Intl` rather than hardcoded, because "AM" is not universal —
 * and taken from the *parts* rather than from the formatted string, since
 * pulling it back out of "7:00 PM" means knowing where the locale puts it.
 */
export function meridiemLabels(locale?: string): [string, string] {
  const format = (hour: number) => {
    try {
      const parts = new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        hour12: true,
      }).formatToParts(new Date(2020, 0, 1, hour));
      return parts.find((part) => part.type === 'dayPeriod')?.value;
    } catch {
      return undefined;
    }
  };
  return [format(9) ?? 'AM', format(21) ?? 'PM'];
}

/** Two digits, so a column of minutes is a column and not a ragged edge. */
export function padTwo(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export interface FormatTimeOptions {
  hourCycle?: HourCycle;
  locale?: string;
}

/**
 * One time as one line of text, in the caller's locale.
 *
 * Falls back to `H:MM` shapes if `Intl` is unavailable or throws on the tag —
 * a picker that renders nothing is worse than one that renders plainly.
 */
export function formatTime(
  value: TimeValue,
  { hourCycle = 12, locale }: FormatTimeOptions = {}
): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: hourCycle === 12,
    }).format(new Date(2020, 0, 1, value.hour, value.minute));
  } catch {
    if (hourCycle === 24) return `${padTwo(value.hour)}:${padTwo(value.minute)}`;
    const [am, pm] = meridiemLabels(locale);
    const suffix = value.hour < 12 ? am : pm;
    return `${displayHour(value.hour, 12)}:${padTwo(value.minute)} ${suffix}`;
  }
}

/** The time part of a `Date`, for callers whose value arrives as one. */
export function timeFromDate(date: Date): TimeValue {
  return { hour: date.getHours(), minute: date.getMinutes() };
}

/**
 * A time put back onto a day. Defaults to today, and seconds are zeroed —
 * a picker with no seconds column has no opinion about them, and carrying the
 * ones that happened to be on the clock makes two equal times unequal.
 */
export function timeToDate(value: TimeValue, day: Date = new Date()): Date {
  const copy = new Date(day);
  copy.setHours(value.hour, value.minute, 0, 0);
  return copy;
}
