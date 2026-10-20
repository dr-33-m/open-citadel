import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';

import type { HighlightMenu } from '@/components/reader/highlight-menu';
import { DEFAULT_HIGHLIGHT_COLOR } from '@/constants/highlights';
import { queryClient } from '@/lib/query-client';
import { createEpisodeItemQueryOptions } from '@/query-manager/podcasts';
import { transcriptKeys } from '@/query-manager/transcripts';
import { sessionExists } from '@/services/chat-sessions';
import { highlightChatContext } from '@/services/highlight-context';
import {
  addHighlightNote,
  deleteHighlight,
  deleteHighlightNote,
  listHighlightNotes,
  updateHighlight,
  updateHighlightNote,
  type HighlightNoteRow,
} from '@/services/highlights';
import type { EpisodeHighlight } from '@/services/podcasts/transcript/highlights';
import { showChatOnSamwellPage } from '@/services/samwell-handoff';
import { highlightSurrounding, suggestTags } from '@/services/tag-suggest';
import { fetchAllTags } from '@/stores/reader';
import { useChatStore } from '@/stores/chat';
import { formatClock } from '@/utils/clock';
import { locatorSeconds } from '@/utils/locator-time';

type HighlightMenuProps = React.ComponentProps<typeof HighlightMenu>;

function parseTags(raw: string | null): string[] {
  try {
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function momentOf(locator: string | null): string | null {
  try {
    const seconds = locator ? locatorSeconds(JSON.parse(locator)) : null;
    return seconds === null ? null : formatClock(seconds);
  } catch {
    return null;
  }
}

/**
 * The reader's highlight sheet (`HighlightMenu`) for one of an episode's
 * highlights: its colour, tags (and Samwell's suggestions), notes, a chat
 * about it, sharing it as an image and deleting it, exactly as a book's. The
 * writes go through `services/highlights`, the reader's own path; a change
 * the transcript or the list draws (a colour, a tag, a delete) reads the
 * episode's highlights again.
 *
 * Spread `menu` onto `HighlightMenu` when it is not null.
 */
export function useEpisodeHighlightEditor(episodeId: string | null, highlights: readonly EpisodeHighlight[]) {
  const router = useRouter();
  const episode = useQuery(createEpisodeItemQueryOptions(episodeId ?? '', { enabled: episodeId !== null })).data ?? null;
  const [visible, setVisible] = React.useState(false);
  // Held through the close, and through a delete, so the sheet keeps its content while it slides away.
  const [held, setHeld] = React.useState<EpisodeHighlight | null>(null);
  const [notes, setNotes] = React.useState<HighlightNoteRow[]>([]);
  const [allTags, setAllTags] = React.useState<string[]>([]);
  const row = (held && highlights.find((highlight) => highlight.id === held.id)) ?? held;

  const reread = React.useCallback(() => {
    if (episodeId) void queryClient.invalidateQueries({ queryKey: transcriptKeys.highlights(episodeId) });
  }, [episodeId]);

  const open = React.useCallback(
    (id: string) => {
      const highlight = highlights.find((candidate) => candidate.id === id);
      if (!highlight) return;
      setHeld(highlight);
      setNotes(listHighlightNotes(id));
      setVisible(true);
      void fetchAllTags().then(setAllTags);
    },
    [highlights],
  );

  if (!row) return { open, menu: null };
  const id = row.id;
  const noteRows = notes.map((note) => ({ id: note.id, text: note.text, createdAt: note.createdAt, updatedAt: note.updatedAt }));

  const startChat = async () => {
    setVisible(false);
    let sessionId = row.chatSessionId && sessionExists(row.chatSessionId) ? row.chatSessionId : null;
    if (!sessionId) {
      sessionId = await useChatStore.getState().createSession({
        bookId: row.bookId,
        title: row.text.slice(0, 60),
        contextText: await highlightChatContext(id, row.text),
        contextLocator: row.locator ?? undefined,
      });
      await updateHighlight(id, { chatSessionId: sessionId });
      reread();
    }
    await showChatOnSamwellPage(sessionId);
    if (router.canDismiss()) router.dismissTo('/');
  };

  const menu: HighlightMenuProps = {
    visible,
    highlightId: id,
    highlightText: row.text,
    currentColor: row.color || DEFAULT_HIGHLIGHT_COLOR,
    currentTags: parseTags(row.tags),
    chatSessionId: row.chatSessionId,
    allTags,
    existingNotes: noteRows,
    bookTitle: episode?.title ?? '',
    authorName: episode?.showTitle ?? '',
    bookCoverUri: episode?.imageUrl ?? episode?.showImageUrl ?? null,
    // On the shared image, under the show: the moment it was said.
    bookCategory: momentOf(row.locator),
    squareCover: true,
    stacked: true,
    onAddNote: (highlightId, text) =>
      void addHighlightNote(highlightId, row.bookId, text).then(() => setNotes(listHighlightNotes(highlightId))),
    onUpdateNote: (noteId, text) => void updateHighlightNote(noteId, text).then(() => setNotes(listHighlightNotes(id))),
    onDeleteNote: (noteId) => void deleteHighlightNote(noteId).then(() => setNotes(listHighlightNotes(id))),
    onDelete: (highlightId) => void deleteHighlight(highlightId).then(reread),
    onUpdateHighlight: (highlightId, updates) =>
      void updateHighlight(highlightId, updates).then(() => {
        reread();
        if ('tags' in updates) void fetchAllTags().then(setAllTags);
      }),
    onStartChat: () => void startChat(),
    onSuggestTags: () =>
      suggestTags({
        text: row.text,
        note: notes.map((note) => note.text).join('\n') || undefined,
        surrounding: highlightSurrounding(row.context),
        bookTitle: episode?.title,
        author: episode?.showTitle,
        existingTags: allTags,
      }),
    onClose: () => setVisible(false),
  };
  return { open, menu };
}
