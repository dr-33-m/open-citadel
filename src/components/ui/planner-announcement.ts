import { useCallback, useEffect, useRef } from 'react';

interface PlannerMonthAnnouncementOptions {
  /** The settled month currently visible in the grid. */
  monthKey: number;
  monthLabel: string;
  announce: (label: string) => void;
}

/**
 * Announces a month only when the next committed render accepts a user request.
 *
 * Prop-driven months stay silent. In a controlled planner, a render that keeps
 * the previous month rejects the pending request and clears it without speaking.
 */
export function usePlannerMonthAnnouncement({
  monthKey,
  monthLabel,
  announce,
}: PlannerMonthAnnouncementOptions): (month: Date) => void {
  const pendingMonth = useRef<number | null>(null);

  const expectMonth = useCallback((month: Date) => {
    pendingMonth.current = month.getTime();
  }, []);

  // Deliberately runs after every commit: an unchanged controlled render is
  // how a parent rejects a request, while a changed matching render accepts it.
  useEffect(() => {
    const expected = pendingMonth.current;
    if (expected === null) return;
    pendingMonth.current = null;
    if (expected === monthKey) announce(monthLabel);
  });

  return expectMonth;
}
