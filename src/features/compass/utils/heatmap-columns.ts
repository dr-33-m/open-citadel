import type { LogView } from '@/services/occurrences';
import {
  addDaysYmd,
  dayOfWeek,
  daysBetween,
  startOfWeekYmd,
  ymdRange,
  type Ymd,
} from '@/utils/day';

export type HeatmapBinLike = { bin: number; count: number; date?: Date };
export type HeatmapColumnLike = { bin: number; bins: HeatmapBinLike[] };

function toDate(ymd: Ymd): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * The goal's life as a grid of weeks, one cell per day, counting logs.
 *
 * Counts every log rather than only the satisfying ones, and that is
 * deliberate: this chart answers "was I showing up", which an honest miss
 * answers as much as a win does. Whether the showing up was any good is the
 * ring's question, and conflating the two would let a blank stretch read the
 * same as a stretch of logged misses.
 *
 * Rows are weekdays with Monday first, matching the week the consistency
 * engine counts in — a grid whose weeks start on a different day from the
 * targets it is drawn beside would quietly disagree with them.
 */
export function buildHeatmapColumns(
  from: Ymd,
  to: Ymd,
  logsByTrackable: Map<string, LogView[]>,
): HeatmapColumnLike[] {
  if (daysBetween(from, to) < 0) return [];

  const counts = new Map<Ymd, number>();
  for (const logs of logsByTrackable.values()) {
    for (const log of logs) {
      if (log.date < from || log.date > to) continue;
      counts.set(log.date, (counts.get(log.date) ?? 0) + 1);
    }
  }

  // Start at the Monday on or before the first day, so partial first and last
  // weeks still line up in their real weekday rows.
  const gridStart = startOfWeekYmd(from);
  const columns: HeatmapColumnLike[] = [];

  let cursor = gridStart;
  let column = 0;
  while (cursor <= to) {
    const week = ymdRange(cursor, addDaysYmd(cursor, 6));
    const bins: HeatmapBinLike[] = [];

    for (const day of week) {
      if (day < from || day > to) continue;
      // Monday-first rows: getUTCDay is Sunday-based, so shift it.
      bins.push({
        bin: (dayOfWeek(day) + 6) % 7,
        count: counts.get(day) ?? 0,
        date: toDate(day),
      });
    }

    if (bins.length > 0) columns.push({ bin: column, bins });
    cursor = addDaysYmd(cursor, 7);
    column += 1;
  }

  return columns;
}
