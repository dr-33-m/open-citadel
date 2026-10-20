import type { Locator } from '@dr33m/react-native-readium';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { useEpisodeHighlightEditor } from '@/features/podcasts/hooks/use-episode-highlight-editor';
import { highlightsLabel } from '@/features/podcasts/utils/transcript-highlights';
import { createEpisodeHighlightsQueryOptions } from '@/query-manager/transcripts';
import { playEpisodeFrom } from '@/services/podcasts/player';
import type { EpisodeHighlight } from '@/services/podcasts/transcript/highlights';
import { locatorSeconds } from '@/utils/locator-time';

const NONE: EpisodeHighlight[] = [];

/**
 * An episode's highlights, for the screens that open them (the episode page's
 * Highlights box, the player's menu), in the reader's own highlights list:
 * search, the colour filters, tags. A tap plays from a highlight's moment and
 * closes the list so the player is what is seen; a long press opens the
 * highlight's sheet (colour, tags, notes, chat, share, delete), as tapping
 * one does in a book.
 */
export function useEpisodeHighlights({ episodeId, title }: { episodeId: string | null; title: string }) {
  const kept = useQuery(createEpisodeHighlightsQueryOptions(episodeId ?? '', { enabled: episodeId !== null })).data ?? NONE;
  const [open, setOpen] = React.useState(false);
  const editor = useEpisodeHighlightEditor(episodeId, kept);
  const count = kept.length;

  const onPress = React.useCallback(
    (locator: Locator) => {
      const seconds = locatorSeconds(locator);
      if (!episodeId || seconds === null) return;
      setOpen(false);
      void playEpisodeFrom(episodeId, seconds);
    },
    [episodeId],
  );

  return {
    count,
    label: highlightsLabel(count),
    open: () => setOpen(true),
    sheet: {
      visible: open && count > 0,
      onClose: () => setOpen(false),
      title,
      highlights: kept,
      onPress,
      onLongPress: editor.open,
    },
    editor: editor.menu,
  };
}

export type EpisodeHighlights = ReturnType<typeof useEpisodeHighlights>;
