import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { useHighlightEditor, type HighlightSource } from '@/hooks/use-highlight-editor';
import { queryClient } from '@/lib/query-client';
import { createEpisodeItemQueryOptions } from '@/query-manager/podcasts';
import { transcriptKeys } from '@/query-manager/transcripts';
import type { EpisodeHighlight } from '@/services/podcasts/transcript/highlights';
import { formatClock } from '@/utils/clock';
import { locatorSeconds } from '@/utils/locator-time';

function momentOf(locator: string | null): string | null {
  try {
    const seconds = locator ? locatorSeconds(JSON.parse(locator)) : null;
    return seconds === null ? null : formatClock(seconds);
  } catch {
    return null;
  }
}

/**
 * The reader's highlight sheet for one of an episode's highlights
 * (`useHighlightEditor`): the episode and its show on the shared image, and
 * under them the moment it was said. A change the transcript or the list
 * draws reads the episode's highlights again.
 *
 * Spread `menu` onto `HighlightMenu` when it is not null.
 */
export function useEpisodeHighlightEditor(episodeId: string | null, highlights: readonly EpisodeHighlight[]) {
  const episode = useQuery(createEpisodeItemQueryOptions(episodeId ?? '', { enabled: episodeId !== null })).data ?? null;
  const source = React.useMemo<HighlightSource>(
    () => ({
      title: episode?.title ?? '',
      author: episode?.showTitle ?? '',
      coverUri: episode?.imageUrl ?? episode?.showImageUrl ?? null,
      squareCover: true,
      detail: (row) => momentOf(row.locator),
    }),
    [episode],
  );
  const reread = React.useCallback(() => {
    if (episodeId) void queryClient.invalidateQueries({ queryKey: transcriptKeys.highlights(episodeId) });
  }, [episodeId]);
  return useHighlightEditor(highlights, source, reread);
}
