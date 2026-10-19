import React from 'react';

import { estimatedPlayback, readPlayback } from '@/features/podcasts/hooks/use-playback-clock';
import { segmentIndexAt } from '@/features/podcasts/utils/transcript-rows';
import { usePodcastPlayer } from '@/stores/podcast-player';

/**
 * The transcript row being spoken, for the lit line.
 *
 * Polled as the current chapter is (`useCurrentChapter`), and it renders
 * again only when the row changes: the clock's ticks never reach the list,
 * only a new index does. `active` is false when the sheet is closed, the
 * episode is not the one in the player, or the transcript has no times.
 */
export function useCurrentSegment(starts: readonly number[], active: boolean): number {
  const isPlaying = usePodcastPlayer((s) => s.isPlaying);
  const [index, setIndex] = React.useState(() => segmentIndexAt(starts, estimatedPlayback()?.position ?? 0));

  React.useEffect(() => {
    if (!active || starts.length === 0) return;
    const read = () => setIndex(segmentIndexAt(starts, readPlayback().position));
    const first = setTimeout(read, 0);
    // Paused too, so a tap on a row while paused moves the light at once.
    const id = setInterval(read, isPlaying ? 500 : 750);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, isPlaying, starts]);

  return active ? index : -1;
}
