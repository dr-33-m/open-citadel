import React from 'react';

import { usePlaybackClock } from '@/features/podcasts/hooks/use-playback-clock';
import { formatClock, formatSpeed } from '@/features/podcasts/utils/format';
import { selectPlaying, usePlayer, usePlayerLoader, type SleepTimer } from '@/stores/player';
import { usePodcastPrefs } from '@/stores/podcast-prefs';

/**
 * "12:04" while a timed sleep counts down, "End" when set for the end of the
 * episode or chapter, null when off. Counts only while `ticking` (the player
 * has landed): a tick renders the whole player, which its opening has no room
 * for.
 */
function useSleepLabel(sleep: SleepTimer, ticking: boolean): string | null {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (sleep?.kind !== 'time' || !ticking) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [sleep, ticking]);
  if (!sleep) return null;
  if (sleep.kind === 'end') return 'End';
  return formatClock(Math.max(0, (sleep.endsAt - now) / 1000));
}

/**
 * What the full player draws whatever is in it: playing or not, the loader,
 * the speed and the sleep timer, the skip lengths, and the clock as shared
 * values (an episode's own, or the whole book's at the listener's speed), so
 * nothing here renders as the audio moves.
 */
export function usePlayerState(landed: boolean) {
  const current = usePlayer((s) => s.current);
  // Playing or about to be: set on the press, so the icon answers at once. The
  // loader only for a wait long enough to notice.
  const isPlaying = usePlayer(selectPlaying);
  const isBuffering = usePlayerLoader();
  const speed = usePlayer((s) => s.speed);
  const sleep = usePlayer((s) => s.sleep);
  const error = usePlayer((s) => s.error);
  const skipBackSec = usePodcastPrefs((s) => s.skipBackSec);
  const skipForwardSec = usePodcastPrefs((s) => s.skipForwardSec);
  const clock = usePlaybackClock(current?.positionSec ?? 0, current?.durationSec ?? 0);

  return {
    isPlaying,
    isBuffering,
    error,
    speed,
    speedLabel: formatSpeed(speed),
    sleep,
    sleepLabel: useSleepLabel(sleep, landed),
    skipBackSec,
    skipForwardSec,
    clock,
  };
}

export type PlayerState = ReturnType<typeof usePlayerState>;
