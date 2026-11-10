import type { Measurement } from 'samwell-shared';

import { formatPubDate } from '@/utils/pub-date';
import { isValidYmd } from '@/utils/day';

/**
 * What a log is about to write, said the way a person would. Pure.
 *
 * The tool call carries an ISO date and a bare number, and the sheet used to
 * print both as they came: "record Read 15 pages as done on 2026-11-09, 15."
 * The day is said as the app says days elsewhere (today, yesterday, a weekday,
 * then a date), and the number takes the trackable's own unit.
 */
export type LogApproval = {
  title: string;
  outcome?: string;
  /** `YYYY-MM-DD`, as the tool sends it; absent means today. */
  date?: string;
  value?: number;
  note?: string;
  measurement?: Measurement;
  now?: Date;
};

/** "today", "yesterday", "on Sunday", "on 3 Nov". */
export function logDayPhrase(date: string | undefined, now: Date = new Date()): string {
  if (!date) return 'today';
  // Not a day the app can read: say it as it came rather than guess.
  if (!isValidYmd(date)) return `on ${date}`;
  // Midday, local: a bare date parses as UTC midnight and can land on the day before.
  const label = formatPubDate(`${date}T12:00:00`, now);
  if (label === 'Today') return 'today';
  if (label === 'Yesterday') return 'yesterday';
  return `on ${label}`;
}

/** "15 pages", "30 minutes", "4 of 5"; nothing for a log that is only done or not. */
export function logAmountPhrase(value: number | undefined, measurement: Measurement | undefined): string | null {
  if (value == null) return null;
  if (!measurement) return String(value);
  switch (measurement.type) {
    case 'COMPLETION':
      return null;
    case 'RATING':
      return `${value} of ${measurement.max}`;
    default:
      return `${value} ${measurement.unit}`;
  }
}

export function logApprovalBody({ title, outcome, date, value, note, measurement, now }: LogApproval): string {
  const when = logDayPhrase(date, now);
  const noted = note ? ` Note: "${note}"` : '';
  if (outcome === 'MISSED') return `Samwell wants to log that "${title}" did not happen ${when}.${noted}`;
  const amount = logAmountPhrase(value, measurement);
  return `Samwell wants to log "${title}" as done ${when}${amount ? `: ${amount}` : ''}.${noted}`;
}
