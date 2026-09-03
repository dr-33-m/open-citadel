/**
 * Calendar-day arithmetic, in one place.
 *
 * The app's calendar day is the LOCAL day, not the UTC one: it has to match
 * the cell a user taps in the calendar and their own sense of "today". An
 * ISO string's date part would silently roll over at the wrong hour for
 * anyone west of UTC.
 *
 * Everything below that does *arithmetic* on a day, however, goes through
 * `Date.UTC`. A day is a label here, not an instant, and building a local
 * `Date` to add days to it means the hour shifts under a DST boundary and a
 * date lands one day out twice a year. UTC has no such boundary, so the
 * arithmetic is exact — the local getters are used only to read what today
 * is, never to move between days.
 *
 * This module is pure: no React Native, no database, no stores. It is
 * imported by the occurrence and consistency engines, which are unit-tested
 * without a device.
 */

/** A local calendar day, `YYYY-MM-DD`. */
export type Ymd = string;

// ── Reading the current day ──────────────────────────────────────────────────

export function localDayString(date: Date = new Date()): Ymd {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── Parsing and formatting ───────────────────────────────────────────────────

/**
 * The device's IANA timezone, resolved once.
 *
 * `Intl.DateTimeFormat()` parses locale data and builds lookup tables on every
 * construction, which is why the house rule is to hoist formatters rather than
 * build them at the call site. The zone cannot change without the app being
 * backgrounded and reopened, so once is enough.
 */
let cachedTimezone: string | null = null;

export function deviceTimezone(): string {
  if (cachedTimezone === null) {
    try {
      cachedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      cachedTimezone = 'UTC';
    }
  }
  return cachedTimezone;
}

export function parseYmd(ymd: Ymd): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split('-').map(Number);
  return { year, month, day };
}

function toYmd(utc: Date): Ymd {
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function utcOf(ymd: Ymd): Date {
  const { year, month, day } = parseYmd(ymd);
  return new Date(Date.UTC(year, month - 1, day));
}

/** True for a well-formed, real calendar date. Guards anything model-supplied. */
export function isValidYmd(value: unknown): value is Ymd {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseYmd(value);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Round-tripping catches the impossible ones: 2026-02-30 normalizes to March.
  return toYmd(new Date(Date.UTC(year, month - 1, day))) === value;
}

// ── Moving between days ──────────────────────────────────────────────────────

/** Calendar-day difference (to - from). Uses Date.UTC so DST cannot skew it. */
export function daysBetween(fromYmd: Ymd, toYmd: Ymd): number {
  return Math.round((utcOf(toYmd).getTime() - utcOf(fromYmd).getTime()) / 86_400_000);
}

export function addDaysYmd(ymd: Ymd, days: number): Ymd {
  const { year, month, day } = parseYmd(ymd);
  return toYmd(new Date(Date.UTC(year, month - 1, day + days)));
}

/**
 * Every day from `from` to `to`, inclusive. Empty when `to` precedes `from`,
 * which is the natural answer for a window that does not exist rather than an
 * error the caller has to handle.
 */
export function ymdRange(from: Ymd, to: Ymd): Ymd[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const out: Ymd[] = new Array(span + 1);
  for (let i = 0; i <= span; i += 1) out[i] = addDaysYmd(from, i);
  return out;
}

/** 0 = Sunday, matching `Date.prototype.getDay()` and the app's weekday rows. */
export function dayOfWeek(ymd: Ymd): number {
  return utcOf(ymd).getUTCDay();
}

// ── Weeks ────────────────────────────────────────────────────────────────────

/**
 * Weeks start on MONDAY.
 *
 * "Three times a week" is counted Monday to Sunday by almost everyone, and the
 * week boundary is what decides whether a flexible target was met — so it is
 * the number on screen, not a display detail. The calendar grid's Sunday-first
 * *layout* is a separate concern and is unaffected by this.
 */
export function startOfWeekYmd(ymd: Ymd): Ymd {
  // getUTCDay is Sunday-based; shift so Monday is 0.
  const offset = (dayOfWeek(ymd) + 6) % 7;
  return addDaysYmd(ymd, -offset);
}

export function endOfWeekYmd(ymd: Ymd): Ymd {
  return addDaysYmd(startOfWeekYmd(ymd), 6);
}

/**
 * ISO 8601 week key, `2026-W12`.
 *
 * The year in the key is the ISO week-numbering year, which is not always the
 * calendar year: 2026-12-28 is a Monday and belongs to 2027-W01. Keying on the
 * calendar year would collide two different weeks at every year boundary, so
 * the real rule is worth the few extra lines — the week containing Thursday
 * decides the year.
 */
export function isoWeekKey(ymd: Ymd): string {
  const thursday = addDaysYmd(startOfWeekYmd(ymd), 3);
  const { year } = parseYmd(thursday);
  const jan4 = `${year}-01-04`;
  const week = Math.floor(daysBetween(startOfWeekYmd(jan4), thursday) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// ── Months ───────────────────────────────────────────────────────────────────

export function startOfMonthYmd(ymd: Ymd): Ymd {
  const { year, month } = parseYmd(ymd);
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function endOfMonthYmd(ymd: Ymd): Ymd {
  const { year, month } = parseYmd(ymd);
  // Day 0 of the next month is the last day of this one, leap years included.
  return toYmd(new Date(Date.UTC(year, month, 0)));
}

/** `2026-03`. Sortable as a string, which is why it is not `3/2026`. */
export function monthKey(ymd: Ymd): string {
  return startOfMonthYmd(ymd).slice(0, 7);
}

// ── Clamping ─────────────────────────────────────────────────────────────────

export function maxYmd(a: Ymd, b: Ymd): Ymd {
  return a >= b ? a : b;
}

export function minYmd(a: Ymd, b: Ymd): Ymd {
  return a <= b ? a : b;
}
