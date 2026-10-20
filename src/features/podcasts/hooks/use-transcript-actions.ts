import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React from 'react';
import type { TranscriptDoc } from 'samwell-shared';

import { showToast } from '@/components/toast/toast-provider';
import { lineSurrounding, type Mark } from '@/features/podcasts/utils/transcript-highlights';
import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { linePassage } from '@/features/podcasts/utils/transcript-rows';
import { queryClient } from '@/lib/query-client';
import { invalidatePodcastLibrary } from '@/query-manager/podcasts';
import { transcriptKeys } from '@/query-manager/transcripts';
import { playEpisodeFrom } from '@/services/podcasts/player';
import { addEpisodeHighlight } from '@/services/podcasts/transcript/highlights';
import { ensureEpisodeBook, renameSpeaker } from '@/services/podcasts/transcript/store';
import { showChatOnSamwellPage } from '@/services/samwell-handoff';
import { useChatStore } from '@/stores/chat';

export type TranscriptMenuKey = 'highlight' | 'ask' | 'copy' | 'rename' | 'reader';
type MenuRow = { key: TranscriptMenuKey; label: string };

const MENU: MenuRow[] = [
  { key: 'highlight', label: 'Highlight' },
  { key: 'ask', label: 'Ask Samwell about this' },
  { key: 'copy', label: 'Copy' },
  { key: 'rename', label: 'Rename the speaker' },
  { key: 'reader', label: 'Read in the reader' },
];
/** A line nobody is named on has no speaker to rename. */
const UNNAMED_MENU = MENU.filter((row) => row.key !== 'rename');

/**
 * What a transcript's lines do. A tap plays from the line's time: a seek in
 * the episode already playing, or the episode started there. A long press
 * opens a small menu: highlight the line (kept on the episode's book, so it
 * reaches the Timeline like a book's), ask Samwell, copy, and so on; on a
 * line already highlighted it opens the highlight's own sheet (colour, tags,
 * notes), the reader's, as tapping a highlight in a book does. A tap
 * on a speaker's name (or Rename in the menu) lets the reader correct it for
 * every line they have, which rewrites the JSON and the episode's EPUB so
 * Samwell and search see the right name too.
 */
export function useTranscriptActions({
  episodeId,
  doc,
  lines,
  marked,
  onEditHighlight,
}: {
  episodeId: string | null;
  doc: TranscriptDoc | null;
  lines: readonly TranscriptLine[];
  /** The highlighted lines, by index, with each one's highlight. */
  marked: ReadonlyMap<number, Mark>;
  /** Opens a highlight's sheet. */
  onEditHighlight: (id: string) => void;
}) {
  const router = useRouter();
  const [menuLine, setMenuLine] = React.useState<TranscriptLine | null>(null);
  const [renaming, setRenaming] = React.useState<number | null>(null);

  const onRow = React.useCallback(
    (line: TranscriptLine) => {
      // A transcript without times has nowhere to play from.
      if (episodeId && line.time !== null) void playEpisodeFrom(episodeId, line.start);
    },
    [episodeId],
  );
  const onLongPress = React.useCallback(
    (line: TranscriptLine) => {
      const mark = marked.get(line.index);
      if (mark) onEditHighlight(mark.id);
      else setMenuLine(line);
    },
    [marked, onEditHighlight],
  );
  const onHeading = React.useCallback((line: TranscriptLine) => {
    if (line.speaker != null) setRenaming(line.speaker);
  }, []);

  const readInReader = React.useCallback(async () => {
    if (!episodeId) return;
    const bookId = await ensureEpisodeBook(episodeId);
    if (bookId) router.push({ pathname: '/reader/[id]', params: { id: bookId } });
  }, [episodeId, router]);

  const askAbout = async (line: TranscriptLine) => {
    if (!episodeId || !doc) return;
    const bookId = await ensureEpisodeBook(episodeId);
    if (!bookId) return;
    const { passage, context } = linePassage(doc, line);
    const sessionId = await useChatStore.getState().createSession({
      bookId,
      title: line.text.slice(0, 60),
      contextText: context,
      passageText: passage,
    });
    await showChatOnSamwellPage(sessionId);
    if (router.canDismiss()) router.dismissTo('/');
  };

  const highlight = async (line: TranscriptLine) => {
    if (!episodeId || !doc) return;
    const place = { segment: line.segment, seconds: line.time === null ? null : line.start, text: line.text, ...lineSurrounding(lines, line.index) };
    const id = await addEpisodeHighlight(episodeId, doc, place).catch(() => null);
    if (!id) {
      showToast({ message: "The highlight couldn't be kept. Try again.", key: 'transcript-highlight' });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: transcriptKeys.highlights(episodeId) });
    showToast({ message: 'Highlighted', tone: 'success', key: 'transcript-highlight' });
  };

  const onMenu = (key: TranscriptMenuKey) => {
    const line = menuLine;
    setMenuLine(null);
    if (!line) return;
    if (key === 'highlight') void highlight(line);
    else if (key === 'ask') void askAbout(line);
    else if (key === 'reader') void readInReader();
    else if (key === 'rename') onHeading(line);
    else {
      void Clipboard.setStringAsync(line.text);
      showToast({ message: 'Copied', tone: 'success', key: 'transcript-copy' });
    }
  };

  const onRename = async (name: string) => {
    const speaker = renaming;
    setRenaming(null);
    if (!episodeId || speaker == null) return;
    await renameSpeaker(episodeId, speaker, name);
    invalidatePodcastLibrary();
  };

  return {
    onRow,
    onLongPress,
    onHeading,
    readInReader,
    menu: {
      visible: menuLine !== null,
      rows: menuLine?.speaker != null ? MENU : UNNAMED_MENU,
      onClose: () => setMenuLine(null),
      onSelect: onMenu,
    },
    rename: {
      visible: renaming !== null,
      name: renaming != null ? (doc?.speakers[renaming] ?? '') : '',
      onClose: () => setRenaming(null),
      onSave: (name: string) => void onRename(name),
    },
  };
}
