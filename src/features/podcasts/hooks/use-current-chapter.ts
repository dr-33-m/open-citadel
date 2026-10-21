import React from 'react';

import { estimatedPlayback, readPlayback } from '@/features/podcasts/hooks/use-playback-clock';
import { chapterIndexAt } from '@/features/podcasts/utils/playback-position';
import type { Chapter } from '@/query-manager/podcasts';
import { usePlayer } from '@/stores/player';

/**
 * The chapter playing, for the title above the scrubber.
 *
 * It renders again only when the chapter changes. The position used to sit in
 * the player screen's state second by second, so the whole player rendered
 * once a second for as long as it was open, its opening and closing included,
 * for a title that changes every few minutes. An episode with no chapters
 * (most of them) is not polled at all.
 *
 * `active` is false while the player is still opening: the first frame goes
 * by where the audio is reckoned to be, and asking the player waits until the
 * screen has landed (see `readPlayback`).
 */
export function useCurrentChapter(chapters: Chapter[], fallbackPosition: number, active: boolean): Chapter | null {
  const loaded = usePlayer((s) => s.loaded);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const [position, setPosition] = React.useState(() => estimatedPlayback()?.position ?? fallbackPosition);
  const polling = active && loaded && chapters.length > 0;

  React.useEffect(() => {
    if (!polling) return;
    const read = () => {
      const now = readPlayback().position;
      setPosition((prev) => (chapterIndexAt(chapters, prev) === chapterIndexAt(chapters, now) ? prev : now));
    };
    const first = setTimeout(read, 0);
    // Paused too, so a chapter jump made while paused shows in the title.
    const id = setInterval(read, isPlaying ? 1000 : 500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [chapters, isPlaying, polling]);

  const index = chapterIndexAt(chapters, loaded ? position : fallbackPosition);
  return index >= 0 ? chapters[index] : null;
}
