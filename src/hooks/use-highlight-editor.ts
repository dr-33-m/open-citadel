import { useRouter } from 'expo-router';
import React from 'react';

import type { HighlightMenu } from '@/components/reader/highlight-menu';
import { DEFAULT_HIGHLIGHT_COLOR } from '@/constants/highlights';
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
  type HighlightRow,
} from '@/services/highlights';
import { showChatOnSamwellPage } from '@/services/samwell-handoff';
import { highlightSurrounding, suggestTags } from '@/services/tag-suggest';
import { fetchAllTags } from '@/stores/reader';
import { useChatStore } from '@/stores/chat';

type HighlightMenuProps = React.ComponentProps<typeof HighlightMenu>;

/** What a highlight was lifted from, as its sheet and its shared image show it. */
export type HighlightSource = {
  title: string;
  author: string;
  coverUri: string | null;
  /** A podcast's cover: square rather than a book's. */
  squareCover?: boolean;
  /** Under the title on the shared image (an episode's moment, a book's category). */
  detail?: (row: HighlightRow) => string | null;
};

function parseTags(raw: string | null): string[] {
  try {
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * The reader's highlight sheet (`HighlightMenu`) for a highlight kept outside
 * the reader: a line of an episode's transcript, a sentence of a book heard in
 * the player. Its colour, tags (and Samwell's suggestions), notes, a chat about
 * it, sharing it as an image and deleting it, exactly as in a book. The writes
 * go through `services/highlights`, the reader's own path; `onChanged` is told
 * after each one, so whatever draws the highlights reads them again.
 *
 * Opened over another sheet, which stays beneath it. Spread `menu` onto
 * `HighlightMenu` when it is not null.
 */
export function useHighlightEditor(highlights: readonly HighlightRow[], source: HighlightSource, onChanged: () => void) {
  const router = useRouter();
  const [visible, setVisible] = React.useState(false);
  // Held through the close, and through a delete, so the sheet keeps its content while it slides away.
  const [held, setHeld] = React.useState<HighlightRow | null>(null);
  const [notes, setNotes] = React.useState<HighlightNoteRow[]>([]);
  const [allTags, setAllTags] = React.useState<string[]>([]);
  const row = (held && highlights.find((highlight) => highlight.id === held.id)) ?? held;

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
      onChanged();
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
    bookTitle: source.title,
    authorName: source.author,
    bookCoverUri: source.coverUri,
    bookCategory: source.detail?.(row) ?? null,
    squareCover: source.squareCover,
    stacked: true,
    onAddNote: (highlightId, text) =>
      void addHighlightNote(highlightId, row.bookId, text).then(() => setNotes(listHighlightNotes(highlightId))),
    onUpdateNote: (noteId, text) => void updateHighlightNote(noteId, text).then(() => setNotes(listHighlightNotes(id))),
    onDeleteNote: (noteId) => void deleteHighlightNote(noteId).then(() => setNotes(listHighlightNotes(id))),
    onDelete: (highlightId) => void deleteHighlight(highlightId).then(onChanged),
    onUpdateHighlight: (highlightId, updates) =>
      void updateHighlight(highlightId, updates).then(() => {
        onChanged();
        if ('tags' in updates) void fetchAllTags().then(setAllTags);
      }),
    onStartChat: () => void startChat(),
    onSuggestTags: () =>
      suggestTags({
        text: row.text,
        note: notes.map((note) => note.text).join('\n') || undefined,
        surrounding: highlightSurrounding(row.context),
        bookTitle: source.title,
        author: source.author,
        existingTags: allTags,
      }),
    onClose: () => setVisible(false),
  };
  return { open, menu };
}
