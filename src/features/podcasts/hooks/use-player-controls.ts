import { useRouter } from 'expo-router';
import React from 'react';

import type { SleepChoice } from '@/features/podcasts/utils/setting-choices';
import { seekTo, setSleepTimer, setSpeed, skipBy, togglePlayback } from '@/services/player';
import { usePlayer, type SleepTimer } from '@/stores/player';

/** Every sheet the full player can raise, for an episode or a book. */
export type PlayerSheet = 'speed' | 'sleep' | 'upnext' | 'chapters' | 'text' | 'voice' | 'menu';

/**
 * What the full player's controls do, whatever is in it, and which of its
 * sheets is open. Also takes the player back down once nothing is left in it
 * (the last episode finished, the book ended or was stopped).
 */
export function usePlayerControls({ skipBackSec, skipForwardSec, sleep }: { skipBackSec: number; skipForwardSec: number; sleep: SleepTimer }) {
  const router = useRouter();
  const [sheet, setSheet] = React.useState<PlayerSheet | null>(null);
  const hasSomething = usePlayer((s) => s.current !== null);
  React.useEffect(() => {
    if (!hasSomething && router.canGoBack()) router.back();
  }, [hasSomething, router]);

  const sleepChoice: SleepChoice = sleep?.kind === 'end' ? 'end' : sleep?.kind === 'time' ? sleep.minutes : 'off';
  const closeSheet = React.useCallback(() => setSheet(null), []);

  return {
    sheet,
    open: (next: PlayerSheet) => () => setSheet(next),
    closeSheet,
    sleepChoice,
    close: () => router.back(),
    toggle: () => void togglePlayback(),
    back: () => skipBy(-skipBackSec),
    forward: () => skipBy(skipForwardSec),
    seek: seekTo,
    setSpeed: (speed: number) => void setSpeed(speed),
    setSleep: (choice: SleepChoice) => setSleepTimer(choice === 'off' ? null : choice),
  };
}

export type PlayerControls = ReturnType<typeof usePlayerControls>;
