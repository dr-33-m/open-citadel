import { activeCheckin, compassDayFor } from '@/services/compass-math';
import { useSettingsStore } from '@/stores/settings';

/**
 * The driver's compass day, resolved against their own check-in times.
 *
 * This is the ONLY way anything should ask "what day is it" in Compass. The
 * personal day boundary sits in the small hours, so between midnight and it the
 * compass day is still yesterday — and a screen that reaches for the raw local
 * date instead will disagree with the store by a day. That is how a milestone
 * set up at 01:00 ended up starting "yesterday" and carrying an estimate one day
 * longer than the driver actually agreed to on screen.
 */
export function currentCompassDay(now: Date = new Date()): string {
  const { compassMorningTime, compassNightTime } = useSettingsStore.getState();
  return compassDayFor(now, compassMorningTime, compassNightTime);
}

/** Which check-in the driver can log right now, against their own times. */
export function currentActiveCheckin(now: Date = new Date()): 'morning' | 'night' {
  const { compassMorningTime, compassNightTime } = useSettingsStore.getState();
  return activeCheckin(now, compassMorningTime, compassNightTime);
}
