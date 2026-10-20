import React from 'react';

import { estimatedPlayback, readPlayback } from '@/features/podcasts/hooks/use-playback-clock';
import { segmentIndexAt } from '@/features/podcasts/utils/transcript-rows';
import { usePodcastPlayer } from '@/stores/podcast-player';

/**
 * How far ahead of the words a line lights: its fade has finished as they
 * start, the way lyrics are timed. Lit on the beat, it read as late.
 */
const LEAD_SEC = 0.25;
/** The longest the player goes unasked while playing, so a seek or a stall is caught. */
const RESYNC_MS = 1500;
/** The soonest it is asked again, so a line a moment long cannot spin the timer. */
const MIN_WAIT_MS = 60;
/** Paused, still asked now and then, so a tap on a line moves the light at once. */
const PAUSED_MS = 750;

/**
 * The transcript line being spoken, for the lit line.
 *
 * Not polled on a fixed beat, which lit each line up to half a second late:
 * every reading works out when the next line starts at the current speed and
 * asks again just then, and at least every second and a half anyway. It
 * renders again only when the line changes: the clock never reaches the
 * list, only a new index does. `active` is false when the sheet is closed,
 * the episode is not the one in the player, or the transcript has no times.
 */
export function useCurrentSegment(starts: readonly number[], active: boolean): number {
  const isPlaying = usePodcastPlayer((s) => s.isPlaying);
  const speed = usePodcastPlayer((s) => s.speed);
  const [index, setIndex] = React.useState(() => segmentIndexAt(starts, (estimatedPlayback()?.position ?? 0) + LEAD_SEC));

  React.useEffect(() => {
    if (!active || starts.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const read = () => {
      const position = readPlayback().position + LEAD_SEC;
      const at = segmentIndexAt(starts, position);
      setIndex(at);
      const next = starts[at + 1];
      const wait = !isPlaying
        ? PAUSED_MS
        : next === undefined
          ? RESYNC_MS
          : Math.min(RESYNC_MS, Math.max(MIN_WAIT_MS, ((next - position) / Math.max(speed, 0.1)) * 1000));
      timer = setTimeout(read, wait);
    };
    timer = setTimeout(read, 0);
    return () => clearTimeout(timer);
  }, [active, isPlaying, speed, starts]);

  return active ? index : -1;
}
