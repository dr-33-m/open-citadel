/**
 * The app's calendar day is the LOCAL day, not the UTC one: it has to match
 * the cell a user taps in the calendar and their own sense of "today". An
 * ISO string's date part would silently roll over at the wrong hour for
 * anyone west of UTC.
 */
export function localDayString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
