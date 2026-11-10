/** The most tools a toolbox row holds before it starts another. */
export const TOOLBOX_ROW_SIZE = 3;

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * How the toolbox's tools are laid out in rows. Pure.
 *
 * The showing tab's own tools take the first row, its lead first (the book in
 * Reading, Log today in Compass). What belongs to the whole conversation, the
 * brain and the history, comes after them, so it opens the second row unless
 * the tab has more than a row of its own (Compass with Past goals), whose
 * overflow then goes first. Every row is shared out evenly by its tiles, so a
 * row of two is two wide tiles and never three with a hole.
 */
export function toolboxRows<T extends { lead?: boolean }>(own: T[], shared: T[]): T[][] {
  const lead = own.find((item) => item.lead);
  const ordered = lead ? [lead, ...own.filter((item) => item !== lead)] : own;
  const first = ordered.slice(0, TOOLBOX_ROW_SIZE);
  const rest = [...ordered.slice(TOOLBOX_ROW_SIZE), ...shared];
  return [first, ...chunk(rest, TOOLBOX_ROW_SIZE)].filter((row) => row.length > 0);
}
