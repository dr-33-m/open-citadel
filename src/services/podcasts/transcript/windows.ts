/**
 * The composer picker's four windows: Today, This week, This month, All.
 * Pure. "This week" is the last seven days, not since Monday: a reader on a
 * Monday morning still wants Sunday's episode.
 */
export type TranscriptWindow = 'today' | 'week' | 'month' | 'all';

export const TRANSCRIPT_WINDOWS: readonly TranscriptWindow[] = ['today', 'week', 'month', 'all'];

/** When the window opens, as an ISO string, or null for All, which has no date limit. */
export function windowStart(window: TranscriptWindow, now: Date): string | null {
  if (window === 'all') return null;
  if (window === 'today') {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    return midnight.toISOString();
  }
  const days = window === 'week' ? 7 : 30;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
