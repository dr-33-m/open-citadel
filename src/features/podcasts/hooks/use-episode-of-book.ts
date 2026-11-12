import React from 'react';

import { formatDuration } from '@/features/podcasts/utils/format';
import { episodeForBook } from '@/services/podcasts/transcript/library';

/**
 * The episode a chat's book is the transcript of, with the line its
 * transcript sheet opens under ("The Show · 1 hr 30 min"). Null for a book or
 * a post, and when nothing is attached.
 */
export function useEpisodeOfBook(bookId: string | null): { episodeId: string; line: string } | null {
  return React.useMemo(() => {
    const found = bookId ? episodeForBook(bookId) : null;
    if (!found) return null;
    return { episodeId: found.episodeId, line: [found.showTitle, formatDuration(found.durationSec)].filter(Boolean).join(' · ') };
  }, [bookId]);
}
