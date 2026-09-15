/**
 * Date helpers for the calendar.
 *
 * No date library. Everything a month grid needs is arithmetic on `Date`, and
 * a dependency that ships a full timezone database to render seven columns is
 * a poor trade for a library whose whole runtime is three small packages.
 *
 * Two rules hold throughout:
 *
 * - **Days are compared at local midnight.** A `Date` carries a time, and two
 *   values on the same day are not equal unless that time is stripped. Every
 *   comparison here goes through `startOfDay`.
 * - **Month arithmetic is done with `setMonth`, not by adding days.** The
 *   platform already knows that a month is 28, 29, 30 or 31 days long.
 *
 * Three more that are easy to lose and expensive to get back:
 *
 * - **Days are stepped with `setDate`, never with milliseconds.** Adding
 *   `n * 86400000` is wrong by an hour on the two days a year the clocks move,
 *   which is enough to land the wrong side of midnight and shift a whole grid.
 * - **A month is normalised to the 1st before months are added.** `setMonth`
 *   on the 31st of a month whose neighbour is shorter overflows into the month
 *   after next — January 31st plus one month is March 3rd.
 * - **Nothing is ever parsed back out of formatted text.** `Intl` is asked for
 *   the *parts* and the numbers are read from those, because the order and the
 *   separators belong to the locale and only the numbers are ours.
 */

/** Names of the weekdays and months, in the caller's locale. */
export type DateLocale = string | undefined;

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isSameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Day 0 of the *next* month, which the platform resolves to the last day of
 * this one — so a leap February needs no special case.
 */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), 1);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function isBefore(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() < startOfDay(b).getTime();
}

export function isAfter(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() > startOfDay(b).getTime();
}

/** Inclusive at both ends, which is what a selected range means to a reader. */
export function isWithin(date: Date, from: Date, to: Date): boolean {
  const time = startOfDay(date).getTime();
  const start = startOfDay(from).getTime();
  const end = startOfDay(to).getTime();
  return time >= Math.min(start, end) && time <= Math.max(start, end);
}

/**
 * `date` pulled inside `min`..`max`, at day resolution.
 *
 * The bound is returned at its own start of day rather than as given, so a
 * `maxDate` that happens to carry a time of 17:30 does not hand back a value
 * that then compares as *after* the last selectable day.
 */
export function clampDate(date: Date, min?: Date, max?: Date): Date {
  if (min && isBefore(date, min)) return startOfDay(min);
  if (max && isAfter(date, max)) return startOfDay(max);
  return date;
}

/**
 * A first-day-of-week index made safe.
 *
 * `weekStartsOn` arrives from a caller and reaches an array index by way of
 * `(day + weekStartsOn) % 7`, where a negative or out-of-range value yields a
 * negative index and an `undefined` weekday name. Both directions wrap.
 */
export function normalizeWeekStart(weekStartsOn: number): number {
  if (!Number.isFinite(weekStartsOn)) return 0;
  return ((Math.trunc(weekStartsOn) % 7) + 7) % 7;
}

/**
 * The day the week starts on where this locale is spoken, as `Date.getDay()`
 * counts it — 0 for Sunday.
 *
 * Sunday is a poor default outside North America and a handful of other
 * regions, but it is the one the platform gives us when it knows nothing. Where
 * `Intl` carries week data, ask it: `en-GB` and `fr-FR` start on Monday, and a
 * calendar that says otherwise is wrong in a way its reader notices immediately.
 */
export function localeWeekStart(locale: DateLocale): number {
  try {
    const tag = (locale ?? 'en').split('-u-')[0] || 'en';
    const resolved = new Intl.Locale(tag) as Intl.Locale & {
      getWeekInfo?: () => { firstDay?: number };
      weekInfo?: { firstDay?: number };
    };
    // Proposed as a method and shipped as a property first; both are in the
    // wild, and neither is guaranteed to be there at all.
    const info = resolved.getWeekInfo?.() ?? resolved.weekInfo;
    const first = info?.firstDay;
    // `Intl` counts 1 = Monday … 7 = Sunday; `Date.getDay()` counts 0 = Sunday.
    if (typeof first === 'number' && Number.isFinite(first)) return first % 7;
  } catch {
    // No week data in this build.
  }
  return 0;
}

/**
 * The six-week grid for a month.
 *
 * Always six rows, and always starting on the chosen first day of the week, so
 * the calendar does not change height as the months are paged through. A grid
 * that grows a row in March and loses it again in April makes everything below
 * it jump, and the days themselves appear to move between months.
 *
 * The leading and trailing cells belong to the neighbouring months; whether
 * they are drawn or left blank is the caller's decision.
 *
 * `system` and `locale` are what make this work for a Hijri grid, where the
 * month it has to open on is not the Gregorian 1st.
 */
export function monthGrid(
  month: Date,
  weekStartsOn: number,
  system: 'gregory' | 'islamic' = 'gregory',
  locale?: DateLocale
): Date[][] {
  const first = startOfCalendarMonth(month, system, locale);
  // How far back to the most recent `weekStartsOn`. The `+ 7` keeps the
  // modulo positive when the week starts later than the first of the month.
  const lead = (first.getDay() - normalizeWeekStart(weekStartsOn) + 7) % 7;
  const start = addDays(first, -lead);

  return Array.from({ length: 6 }, (_unusedWeek, week) =>
    Array.from({ length: 7 }, (_unusedDay, day) => addDays(start, week * 7 + day))
  );
}

/**
 * Formatting, guarded.
 *
 * `Intl` is on modern Hermes, but the data behind it is not guaranteed —
 * builds without the full ICU set throw or return something unusable for
 * locales they do not carry. Every formatter here falls back to English rather
 * than taking the screen down over a month name.
 */
/**
 * Formatters, kept.
 *
 * Building an `Intl.DateTimeFormat` is the expensive part of formatting, and a
 * Hijri grid asks for one per cell twice over — once to decide which month the
 * cell belongs to and once for the number in it — which is 84 constructions a
 * render before anyone touches the year dropdown, where a century jump used to
 * cost tens of thousands. The set of shapes asked for is tiny and fixed, so it
 * is cached for the life of the process. A failure is cached too: a build with
 * no data for a locale will not acquire any by being asked again.
 */
const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatter(
  locale: DateLocale,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat | null {
  // Sorted, so two call sites writing the same options in a different order
  // share one entry rather than building two.
  const shape = Object.keys(options)
    .sort()
    .map((key) => `${key}=${String(options[key as keyof Intl.DateTimeFormatOptions])}`)
    .join(',');
  const key = `${locale ?? ''}|${shape}`;

  if (formatters.has(key)) return formatters.get(key) ?? null;

  let made: Intl.DateTimeFormat | null = null;
  try {
    made = new Intl.DateTimeFormat(locale, options);
  } catch {
    made = null;
  }
  formatters.set(key, made);
  return made;
}

function format(date: Date, locale: DateLocale, options: Intl.DateTimeFormatOptions): string | null {
  try {
    return formatter(locale, options)?.format(date) ?? null;
  } catch {
    // Constructing succeeded and formatting still failed — some builds only
    // discover a missing calendar at format time.
    return null;
  }
}

/**
 * A locale tag carrying an explicit calendar and Latin digits.
 *
 * The calendar has to go in the *tag*, not in the options bag. Hermes builds
 * its `Intl` on the platform's own date formatter, which reads the Unicode
 * extension on a locale identifier but does not reliably honour `calendar` as
 * an option — so `{ calendar: 'gregory' }` was quietly ignored and an Arabic
 * device kept answering in Hijri. Any extension already on the tag is dropped
 * first, so a caller passing `ar-u-ca-islamic` cannot end up with two.
 */
function withCalendar(locale: DateLocale, calendar: 'gregory' | 'islamic'): string {
  const base = (locale ?? 'en').split('-u-')[0] || 'en';
  return `${base}-u-ca-${calendar}-nu-latn`;
}

/**
 * Gregorian formatting, pinned.
 *
 * Asking for a month name in Arabic without saying which calendar gets a Hijri
 * one back, because that is what the locale resolves to — right for the
 * language, wrong for a grid whose cells are counting Gregorian days. The
 * digits are pinned too, so the caption and the numbers under it are in one
 * set.
 */
function formatGregory(
  date: Date,
  locale: DateLocale,
  options: Intl.DateTimeFormatOptions
): string | null {
  return (
    format(date, withCalendar(locale, 'gregory'), options) ??
    // A build that cannot parse the extension at all still gets asked, in the
    // hope that it honours the option instead.
    format(date, locale, { ...options, calendar: 'gregory', numberingSystem: 'latn' })
  );
}

/* -------------------------------------------------------------------------- */
/* Calendar systems                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which calendar the months and day numbers are counted in.
 *
 * `auto` takes whatever the locale resolves to, which on an Arabic device is
 * usually islamic. It is not the default: a grid whose month boundaries move
 * with the device's language is a surprise, and the caller who wants that can
 * ask for it.
 */
export type CalendarSystem = 'gregory' | 'islamic' | 'auto';

/** Year, month and day as the chosen calendar counts them. 1-based month. */
export interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

/** What `auto` resolves to for a locale, falling back to the Gregorian. */
export function resolveCalendar(system: CalendarSystem, locale: DateLocale): 'gregory' | 'islamic' {
  if (system !== 'auto') return system;
  try {
    const resolved = formatter(locale, {})?.resolvedOptions().calendar ?? '';
    return resolved.startsWith('islamic') ? 'islamic' : 'gregory';
  } catch {
    return 'gregory';
  }
}

/**
 * A date's year, month and day in the given calendar.
 *
 * `formatToParts` rather than a parsed string, because the order and the
 * separators are the locale's business and we only want the numbers. The
 * numbering system is pinned to Latin so the parts come back parseable
 * whatever language is on the device, and so the cells and the caption above
 * them end up in one set of digits.
 */
export function calendarParts(
  date: Date,
  system: 'gregory' | 'islamic',
  locale: DateLocale
): CalendarParts {
  if (system === 'gregory') {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
  try {
    const parts = formatter(withCalendar(locale, 'islamic'), {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })?.formatToParts(date);
    if (!parts) throw new Error('unusable');
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const year = read('year');
    const month = read('month');
    const day = read('day');
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      throw new Error('unusable');
    }
    return { year, month, day };
  } catch {
    // No islamic data in this build. Gregorian is wrong, but it is coherent —
    // the grid, the caption and the cells will at least agree with each other.
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
}

export function isSameCalendarMonth(
  a: Date,
  b: Date,
  system: 'gregory' | 'islamic',
  locale: DateLocale
): boolean {
  if (system === 'gregory') return isSameMonth(a, b);
  const one = calendarParts(a, system, locale);
  const two = calendarParts(b, system, locale);
  return one.year === two.year && one.month === two.month;
}

/** Whether two days fall in the same year and month of the given calendar. */
function sameCalendarMonthParts(a: CalendarParts, b: CalendarParts): boolean {
  return a.year === b.year && a.month === b.month;
}

/**
 * The first day of the calendar month `date` falls in.
 *
 * Walked back a day at a time rather than computed. A Hijri month is 29 or 30
 * days depending on the year, and the platform's own calendar data already
 * knows which — asking it is better than shipping a table that will disagree
 * with the device.
 *
 * The walk stops where the *month number changes*, not where the day number
 * reads 1. The observational Islamic calendars the platforms ship do not always
 * label a day 1: in 1450 AH, month 11 day 30 is followed directly by month 12
 * day 2. Hunting for a day 1 that is never emitted walked the cursor off the
 * end of its budget and then paged the calendar to the same month forever.
 */
export function startOfCalendarMonth(
  date: Date,
  system: 'gregory' | 'islamic',
  locale: DateLocale
): Date {
  if (system === 'gregory') return startOfMonth(date);
  let cursor = startOfDay(date);
  const target = calendarParts(cursor, system, locale);
  // 32, not 31: one step more than the longest month, so the loop is bounded
  // by a real answer rather than by running out.
  for (let step = 0; step < 32; step += 1) {
    const previous = addDays(cursor, -1);
    if (!sameCalendarMonthParts(calendarParts(previous, system, locale), target)) {
      return cursor;
    }
    cursor = previous;
  }
  return cursor;
}

/** Days in the calendar month `date` falls in. */
export function daysInCalendarMonth(
  date: Date,
  system: 'gregory' | 'islamic',
  locale: DateLocale
): number {
  if (system === 'gregory') return endOfMonth(date).getDate();
  const start = startOfCalendarMonth(date, system, locale);
  const parts = calendarParts(start, system, locale);
  // The first offset that lands outside this month is its length, whatever the
  // day numbers along the way are called.
  for (let length = 28; length <= 31; length += 1) {
    if (!sameCalendarMonthParts(calendarParts(addDays(start, length), system, locale), parts)) {
      return length;
    }
  }
  return 30;
}

/** Page by whole calendar months, forwards or back. */
export function addCalendarMonths(
  date: Date,
  months: number,
  system: 'gregory' | 'islamic',
  locale: DateLocale
): Date {
  if (system === 'gregory') return addMonths(date, months);
  let cursor = startOfCalendarMonth(date, system, locale);
  for (let step = 0; step < Math.abs(months); step += 1) {
    cursor =
      months > 0
        ? // One past the end of this month is the first of the next.
          addDays(cursor, daysInCalendarMonth(cursor, system, locale))
        : // One before the start of this month is somewhere in the previous
          // one, which then gets walked back to its own first day.
          startOfCalendarMonth(addDays(cursor, -1), system, locale);
  }
  return cursor;
}

/** The day-of-month a cell shows. */
export function calendarDayNumber(
  date: Date,
  system: 'gregory' | 'islamic',
  locale: DateLocale
): number {
  return system === 'gregory' ? date.getDate() : calendarParts(date, system, locale).day;
}

/** "Ramadan 1447" or "March 2026", in whichever calendar is in force. */
export function calendarMonthLabel(
  date: Date,
  system: 'gregory' | 'islamic',
  locale: DateLocale
): string {
  if (system === 'gregory') return monthLabel(date, locale);
  return (
    format(date, withCalendar(locale, 'islamic'), { month: 'long', year: 'numeric' }) ??
    monthLabel(date, locale)
  );
}

/**
 * The names of a calendar's months, in order, for the dropdown.
 *
 * Sampled from a real year in that calendar rather than from twelve Gregorian
 * firsts — the old code did the latter and got twelve arbitrary Hijri names in
 * whatever order the Gregorian 1sts happened to fall, then indexed them by
 * Gregorian month, which meant nothing at all.
 */
export function calendarMonthNames(
  reference: Date,
  system: 'gregory' | 'islamic',
  locale: DateLocale,
  style: 'long' | 'short' = 'short'
): string[] {
  if (system === 'gregory') return monthNames(locale, style);
  const names: string[] = [];
  let cursor = startOfCalendarMonth(reference, system, locale);
  // Back to month 1 of this year, then forward through all twelve.
  cursor = addCalendarMonths(cursor, -(calendarParts(cursor, system, locale).month - 1), system, locale);
  for (let month = 0; month < 12; month += 1) {
    names.push(
      format(cursor, withCalendar(locale, 'islamic'), { month: style }) ?? String(month + 1)
    );
    cursor = addCalendarMonths(cursor, 1, system, locale);
  }
  return names;
}

/** The whole date read out, in whichever calendar is in force. */
export function calendarLongDate(
  date: Date,
  system: 'gregory' | 'islamic',
  locale: DateLocale
): string {
  if (system === 'gregory') return longDate(date, locale);
  return (
    format(date, withCalendar(locale, 'islamic'), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }) ?? longDate(date, locale)
  );
}

/** The compact form a trigger shows, in whichever calendar is in force. */
export function calendarShortDate(
  date: Date,
  system: 'gregory' | 'islamic',
  locale: DateLocale
): string {
  if (system === 'gregory') return shortDate(date, locale);
  return (
    format(date, withCalendar(locale, 'islamic'), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }) ?? shortDate(date, locale)
  );
}

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Month names in order, for the caption and its dropdown. */
export function monthNames(locale: DateLocale, style: 'long' | 'short' = 'long'): string[] {
  return MONTHS_EN.map((fallback, month) => {
    const formatted = formatGregory(new Date(2021, month, 1), locale, { month: style });
    return formatted ?? (style === 'short' ? fallback.slice(0, 3) : fallback);
  });
}

/** Column headings, rotated so the first one is `weekStartsOn`. */
export function weekdayNames(
  locale: DateLocale,
  weekStartsOn: number,
  /*
   * `narrow` is a single letter in most locales, and several of them repeat —
   * English has T twice and S twice. That is only safe where the column it
   * heads is already unambiguous by position, which is why it is a caller's
   * choice rather than the default.
   */
  width: 'short' | 'narrow' = 'short'
): string[] {
  const first = normalizeWeekStart(weekStartsOn);
  // 2021-08-01 was a Sunday, so adding the index lands on each weekday in turn.
  return Array.from({ length: 7 }, (_unused, day) => {
    const index = (day + first) % 7;
    const formatted = formatGregory(new Date(2021, 7, 1 + index), locale, { weekday: width });
    return formatted ?? (width === 'narrow' ? WEEKDAYS_EN[index]![0]! : WEEKDAYS_EN[index]!);
  });
}

/** "March 2026", for the caption. */
export function monthLabel(date: Date, locale: DateLocale): string {
  return (
    formatGregory(date, locale, { month: 'long', year: 'numeric' }) ??
    `${MONTHS_EN[date.getMonth()]} ${date.getFullYear()}`
  );
}

/** "12 March 2026" — the whole date, for a screen reader to read out. */
export function longDate(date: Date, locale: DateLocale): string {
  return (
    formatGregory(date, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) ??
    `${WEEKDAYS_EN[date.getDay()]} ${date.getDate()} ${MONTHS_EN[date.getMonth()]} ${date.getFullYear()}`
  );
}

/** "12 Mar 2026" — the compact form a trigger shows. */
export function shortDate(date: Date, locale: DateLocale): string {
  return (
    formatGregory(date, locale, { day: 'numeric', month: 'short', year: 'numeric' }) ??
    `${date.getDate()} ${MONTHS_EN[date.getMonth()]!.slice(0, 3)} ${date.getFullYear()}`
  );
}
