/**
 * The parts of a planner that are arithmetic rather than rendering: which
 * entries fall on which day, which category an entry belongs to, what a day
 * says to a screen reader, and what the month adds up to.
 *
 * Kept out of the component so they can be tested without a renderer, and so
 * the day cell stays a function of its inputs rather than of when it ran.
 *
 * Nothing here imports anything. The tests run this file through `node --test`
 * with type stripping rather than a bundler, so an extensionless import of a
 * sibling module — which is how the rest of the library is written — does not
 * resolve. That is why the one line of date arithmetic below is here instead
 * of coming from `utils/date`.
 */

/** The minimum an entry has to be for the grid to place it. */
export interface PlannerDatedEntry {
  date: Date;
  /** Matches a `PlannerCategory` id. An entry without one is uncategorised. */
  category?: string;
}

export interface PlannerCountedCategory {
  id: string;
  label: string;
  count: number;
}

/** A day's key: local midnight, so two times on the same day agree. */
export function dayKey(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Entries grouped by the day they fall on, each day in the order it was given.
 *
 * A map rather than a lookup per cell: a month draws 42 cells, and asking each
 * of them to filter the whole list is 42 passes over it every render.
 */
export function bucketByDay<T extends PlannerDatedEntry>(
  entries: readonly T[]
): Map<number, T[]> {
  const days = new Map<number, T[]>();
  for (const entry of entries) {
    const key = dayKey(entry.date);
    const bucket = days.get(key);
    if (bucket) bucket.push(entry);
    else days.set(key, [entry]);
  }
  return days;
}

/** What falls on one day. Always an array, so a cell has nothing to guard. */
export function entriesOn<T extends PlannerDatedEntry>(
  days: Map<number, T[]>,
  date: Date
): T[] {
  return days.get(dayKey(date)) ?? EMPTY;
}

/*
 * One frozen array for every empty day, rather than a new `[]` each call. A
 * month is mostly empty days, and a fresh array per cell per render defeats
 * every memo below it for a day where nothing changed.
 */
const EMPTY: never[] = Object.freeze([]) as never[];

/**
 * How many entries a cell draws before it stops and says how many are left.
 *
 * `limit` of 0 means draw none of them — the day still carries its marker and
 * its spoken label, which is the whole content of a compact planner.
 */
export function visibleEntries<T>(entries: readonly T[], limit: number): {
  shown: T[];
  overflow: number;
} {
  const cap = Math.max(0, Math.floor(limit));
  if (entries.length <= cap) return { shown: [...entries], overflow: 0 };
  return { shown: entries.slice(0, cap), overflow: entries.length - cap };
}

/**
 * What a day says when it is read out.
 *
 * The date on its own is what a date picker says, and it is not enough here: a
 * day in a planner differs from the one beside it by what is on it, and a
 * marker that carries that difference in colour alone carries it to nobody who
 * cannot see the colour. So the count and the categories are spoken.
 *
 * `dateLabel` is passed in rather than formatted here, so the grid and the
 * label agree about the calendar system and the locale.
 */
export function dayAccessibilityLabel<T extends PlannerDatedEntry>(
  dateLabel: string,
  entries: readonly T[],
  categoryLabels: ReadonlyMap<string, string>
): string {
  if (entries.length === 0) return `${dateLabel}, nothing planned`;

  const named: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const label = entry.category ? categoryLabels.get(entry.category) : undefined;
    if (label && !seen.has(label)) {
      seen.add(label);
      named.push(label);
    }
  }

  const count = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  return named.length > 0
    ? `${dateLabel}, ${count}: ${named.join(', ')}`
    : `${dateLabel}, ${count}`;
}

/**
 * What the month adds up to, per category, in the order the categories were
 * declared — so the legend and the totals beside it never disagree about which
 * one comes first.
 *
 * Entries outside `month` are left out. The grid draws the days either side of
 * the month it is showing, and counting those would make a total that changes
 * with the week the month happens to start on.
 */
export function summariseMonth<T extends PlannerDatedEntry>(
  days: Map<number, T[]>,
  grid: readonly (readonly Date[])[],
  categories: readonly { id: string; label: string }[],
  isInMonth: (date: Date) => boolean
): { total: number; categories: PlannerCountedCategory[] } {
  const counts = new Map<string, number>();
  let total = 0;

  for (const week of grid) {
    for (const date of week) {
      if (!isInMonth(date)) continue;
      for (const entry of entriesOn(days, date)) {
        total += 1;
        if (entry.category) {
          counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
        }
      }
    }
  }

  return {
    total,
    categories: categories.map(({ id, label }) => ({
      id,
      label,
      count: counts.get(id) ?? 0,
    })),
  };
}

/**
 * Minutes since midnight, or `null` for an entry that lands exactly on it.
 *
 * The grid has only ever read an entry's day, so a date with no time set is
 * midnight — and that is indistinguishable from something genuinely scheduled
 * at 00:00. Reading it as all-day is the right way round: a set of entries
 * built without times renders as a list of things happening that day, which is
 * what it is, rather than as a column of midnights.
 */
export function entryTimeMinutes(date: Date): number | null {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes === 0 ? null : minutes;
}

/**
 * All-day first, then by time, keeping the caller's order within each.
 *
 * All-day leads because it frames the rest of the day rather than falling at a
 * point in it, and a list that opens with "All day" reads as a heading for
 * what follows.
 */
export function sortByTime<T extends PlannerDatedEntry>(entries: readonly T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index, at: entryTimeMinutes(entry.date) }))
    .sort((a, b) => {
      if (a.at === null && b.at === null) return a.index - b.index;
      if (a.at === null) return -1;
      if (b.at === null) return 1;
      return a.at === b.at ? a.index - b.index : a.at - b.at;
    })
    .map(({ entry }) => entry);
}
