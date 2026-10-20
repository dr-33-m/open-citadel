import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';

import { useQuoteExport } from '@/hooks/use-quote-export';
import type { TranscriptMenuKey } from '@/features/podcasts/hooks/use-transcript-actions';
import { highlightLines, highlightsLabel } from '@/features/podcasts/utils/transcript-highlights';
import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { queryClient } from '@/lib/query-client';
import { createEpisodeHighlightsQueryOptions, transcriptKeys } from '@/query-manager/transcripts';
import { deleteHighlight } from '@/services/highlights';
import { highlightChatContext } from '@/services/highlight-context';
import { playEpisodeFrom } from '@/services/podcasts/player';
import { ensureEpisodeBook } from '@/services/podcasts/transcript/store';
import { showChatOnSamwellPage } from '@/services/samwell-handoff';
import { useChatStore } from '@/stores/chat';

type MenuRow = { key: TranscriptMenuKey; label: string };

const MENU: MenuRow[] = [
  { key: 'play', label: 'Play from here' },
  { key: 'ask', label: 'Ask Samwell about this' },
  { key: 'share', label: 'Share as an image' },
  { key: 'unhighlight', label: 'Remove the highlight' },
];
/** One made in the reader has no moment to play from. */
const UNTIMED_MENU = MENU.filter((row) => row.key !== 'play');
/** The time column: "12:04", or "1:02:04" past the hour. */
const GUTTER = 52;
const GUTTER_HOURS = 68;

export type HighlightSource = {
  episodeId: string | null;
  title: string;
  showTitle: string;
  coverUri: string | null;
};

/**
 * An episode's highlights, for the screens that open them (the episode page's
 * Highlights box, the player's menu). A tap plays from a highlight's moment
 * and closes the sheet so the player is what is seen; a long press offers
 * Samwell, sharing it as an image, and removing it. The last one removed
 * closes the sheet, since there is then nothing to open it on.
 */
export function useEpisodeHighlights({ episodeId, title, showTitle, coverUri }: HighlightSource) {
  const router = useRouter();
  const kept = useQuery(createEpisodeHighlightsQueryOptions(episodeId ?? '', { enabled: episodeId !== null })).data;
  const { lines, byIndex } = React.useMemo(() => highlightLines(kept ?? []), [kept]);
  const [open, setOpen] = React.useState(false);
  const [held, setHeld] = React.useState<TranscriptLine | null>(null);
  const quoteExport = useQuoteExport();
  const count = lines.length;
  const lastStart = lines.reduce((most, line) => Math.max(most, line.start), 0);

  const onPress = React.useCallback(
    (line: TranscriptLine) => {
      if (!episodeId || line.time === null) return;
      setOpen(false);
      void playEpisodeFrom(episodeId, line.start);
    },
    [episodeId],
  );
  const onLongPress = React.useCallback((line: TranscriptLine) => setHeld(line), []);

  const ask = async (line: TranscriptLine) => {
    const highlight = byIndex[line.index];
    const bookId = episodeId ? await ensureEpisodeBook(episodeId) : null;
    if (!highlight || !bookId) return;
    const sessionId = await useChatStore.getState().createSession({
      bookId,
      title: highlight.text.slice(0, 60),
      contextText: await highlightChatContext(highlight.id, highlight.text),
    });
    setOpen(false);
    await showChatOnSamwellPage(sessionId);
    if (router.canDismiss()) router.dismissTo('/');
  };
  const remove = async (line: TranscriptLine) => {
    const highlight = byIndex[line.index];
    if (!highlight || !episodeId) return;
    await deleteHighlight(highlight.id);
    void queryClient.invalidateQueries({ queryKey: transcriptKeys.highlights(episodeId) });
  };
  const onMenu = (key: TranscriptMenuKey) => {
    const line = held;
    setHeld(null);
    if (!line) return;
    if (key === 'play') onPress(line);
    else if (key === 'ask') void ask(line);
    else if (key === 'unhighlight') void remove(line);
    else if (key === 'share') {
      quoteExport.share({
        text: line.text,
        title,
        author: showTitle,
        coverUri,
        detail: line.time,
        squareCover: true,
      });
    }
  };

  return {
    count,
    label: highlightsLabel(count),
    open: () => setOpen(true),
    sheet: {
      visible: open && count > 0,
      onClose: () => setOpen(false),
      title,
      lines,
      gutter: lines.every((line) => line.time === null) ? 0 : lastStart >= 3600 ? GUTTER_HOURS : GUTTER,
      onPress,
      onLongPress,
    },
    menu: {
      visible: held !== null,
      rows: held?.time === null ? UNTIMED_MENU : MENU,
      onClose: () => setHeld(null),
      onSelect: onMenu,
    },
    card: quoteExport.card,
  };
}

export type EpisodeHighlights = ReturnType<typeof useEpisodeHighlights>;
