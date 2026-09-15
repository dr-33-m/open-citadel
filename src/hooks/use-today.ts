import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { millisecondsUntilNextLocalDay } from '@/components/ui/planner-today';
import { localDayString, type Ymd } from '@/utils/day';

/**
 * Today, and it stays today.
 *
 * `localDayString()` read straight in a render is only correct for as long as
 * that render lasts. Anything counting down to a date — "83 days left", the
 * planner's ring around today, a heatmap that stops at the last lived day —
 * is then frozen at whatever the day was when it last rendered for some other
 * reason. Leave the app open overnight, or leave it backgrounded for two days
 * and come back, and the number is simply wrong until something unrelated
 * happens to re-render it.
 *
 * So the date is state, and two things move it: a timer set for local midnight,
 * and the app coming back to the foreground. Both are needed — a phone that
 * slept through midnight never ran the timer, and a phone in your hand at
 * midnight never resumes.
 *
 * The same string is returned rather than a new one when the day has not
 * changed, so this only re-renders on the day actually turning over.
 *
 * `millisecondsUntilNextLocalDay` comes from the vendored planner, which
 * solved this for its own grid first. One clock, not two.
 */
export function useToday(): Ymd {
  const [today, setToday] = useState<Ymd>(() => localDayString());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    };

    const refreshAndSchedule = () => {
      const now = new Date();
      const next = localDayString(now);
      setToday((previous) => (previous === next ? previous : next));
      clearTimer();
      timer = setTimeout(refreshAndSchedule, millisecondsUntilNextLocalDay(now));
    };

    refreshAndSchedule();
    // Backgrounded, the timer is unreliable and the work is pointless; on the
    // way back it is the only thing that can have gone stale.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAndSchedule();
      else clearTimer();
    });

    return () => {
      clearTimer();
      subscription.remove();
    };
  }, []);

  return today;
}
