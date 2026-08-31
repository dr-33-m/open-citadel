import React from 'react';

import { eq } from 'drizzle-orm';

import { useSettingsStore } from '@/stores/settings';
import { db } from '@/db/client';
import { compassGoals } from '@/db/schema';
import { syncCompassReminders } from '@/services/compass-notifications';
import type { TimeValue } from '@/components/ui/time-picker';

const clampPart = (raw: string, kind: 'hour' | 'minute', fallback: number) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return kind === 'hour' ? Math.min(23, Math.max(0, n)) : Math.min(59, Math.max(0, n));
};

/**
 * The Compass check-in times: which picker is open, the wheel's draft, and
 * the commit. The wheel edits the draft; SET TIME commits once, so the
 * store write and the reminder resync happen once per pick rather than on
 * every wheel settle.
 */
export function useCompassTimes() {
  const morningTime = useSettingsStore((s) => s.compassMorningTime);
  const nightTime = useSettingsStore((s) => s.compassNightTime);
  const setCompassTimes = useSettingsStore((s) => s.setCompassTimes);

  const [picking, setPicking] = React.useState<'morning' | 'night' | null>(null);
  const [draft, setDraft] = React.useState<TimeValue>({ hour: 8, minute: 0 });

  const openPicker = React.useCallback(
    (kind: 'morning' | 'night') => {
      const [h, m] = (kind === 'night' ? nightTime : morningTime).split(':');
      setDraft({ hour: clampPart(h, 'hour', 8), minute: clampPart(m, 'minute', 0) });
      setPicking(kind);
    },
    [morningTime, nightTime],
  );

  const closePicker = React.useCallback(() => setPicking(null), []);

  const commit = React.useCallback(
    async (kind: 'morning' | 'night', next: string) => {
      const nextMorning = kind === 'morning' ? next : morningTime;
      const nextNight = kind === 'night' ? next : nightTime;
      await setCompassTimes(nextMorning, nextNight);
      const hasActiveGoal = Boolean(
        db.select().from(compassGoals).where(eq(compassGoals.status, 'active')).get(),
      );
      await syncCompassReminders({ morningTime: nextMorning, nightTime: nextNight, hasActiveGoal });
    },
    [morningTime, nightTime, setCompassTimes],
  );

  return { morningTime, nightTime, picking, draft, setDraft, openPicker, closePicker, commit };
}
