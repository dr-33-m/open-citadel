const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-07-15' → '15 Jul' (or '15 Jul 2027' when not the current year). */
export function formatCompassDate(ymd: string, now: Date = new Date()): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const base = `${day} ${MONTHS[month - 1] ?? '?'}`;
  return year === now.getFullYear() ? base : `${base} ${year}`;
}

export function formatVariance(varianceDays: number): string {
  const days = Math.abs(varianceDays);
  const unit = days === 1 ? 'day' : 'days';
  if (varianceDays > 0) return `${days} ${unit} behind the original estimate`;
  if (varianceDays < 0) return `${days} ${unit} ahead of the original estimate`;
  return 'On the original estimate';
}
