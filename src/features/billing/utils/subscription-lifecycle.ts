const SUBSCRIPTION_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

export function formatSubscriptionDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return SUBSCRIPTION_DATE_FORMATTER.format(date);
}

const TERM_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * A date with its year, for an end that can be a year away.
 *
 * A renewal is always inside the next month, so "13 Oct" is enough for one.
 * An insider plan can run until the same day next year, and "13 Oct" read
 * today would say it ends today.
 */
export function formatTermDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return TERM_DATE_FORMATTER.format(date);
}
