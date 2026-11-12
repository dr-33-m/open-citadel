import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React from 'react';

import type { FollowAlongMenuKey } from '@/components/follow-along/follow-along-menu-sheet';
import { showToast } from '@/components/toast/toast-provider';
import { DEFAULT_HIGHLIGHT_COLOR } from '@/constants/highlights';
import { useHighlightNow } from '@/features/audiobook/hooks/use-highlight-now';
import { sentenceMarks, type SentenceMark } from '@/features/audiobook/utils/sentence-marks';
import { useHighlightEditor, type HighlightSource } from '@/hooks/use-highlight-editor';
import { queryClient } from '@/lib/query-client';
import { audiobookKeys, createBookHighlightsQueryOptions } from '@/query-manager/audiobook';
import type { ChapterText } from '@/services/audiobook/text';
import type { HighlightRow } from '@/services/highlights';
import { showChatOnSamwellPage } from '@/services/samwell-handoff';
import { useChatStore } from '@/stores/chat';
import type { BookNowPlaying } from '@/stores/player';

const MENU: { key: FollowAlongMenuKey; label: string }[] = [
  { key: 'highlight', label: 'Highlight' },
  { key: 'ask', label: 'Ask Samwell about this' },
  { key: 'copy', label: 'Copy' },
];
const NO_HIGHLIGHTS: HighlightRow[] = [];
const NO_MARKS = new Map<string, SentenceMark>();

/**
 * What a long press on a sentence of the book's text does, as on a line of a
 * transcript (`useTranscriptActions`). On a sentence not highlighted, a small
 * menu: highlight it, ask Samwell about it, or copy it. On one already
 * highlighted (from the player, from here, or in the reader), the reader's
 * highlight sheet: its colour, tags and notes. Every highlight is the book's
 * own, so the Timeline opens the book at it.
 */
export function useBookTextActions({ visible, book, chapter }: { visible: boolean; book: BookNowPlaying | null; chapter: ChapterText | null }) {
  const router = useRouter();
  const bookId = book?.bookId ?? '';
  const kept = useQuery(createBookHighlightsQueryOptions(bookId, { enabled: visible && bookId !== '' })).data ?? NO_HIGHLIGHTS;
  const marks = React.useMemo(
    () => (chapter ? sentenceMarks(chapter.sentences, chapter.href, kept, DEFAULT_HIGHLIGHT_COLOR) : NO_MARKS),
    [chapter, kept],
  );
  const reread = React.useCallback(() => {
    if (bookId) void queryClient.invalidateQueries({ queryKey: audiobookKeys.highlights(bookId) });
  }, [bookId]);
  const source = React.useMemo<HighlightSource>(
    () => ({ title: book?.title ?? '', author: book?.author ?? '', coverUri: book?.coverUrl ?? null, detail: () => book?.chapterTitle ?? null }),
    [book],
  );
  const editor = useHighlightEditor(kept, source, reread);
  const { open: openEditor } = editor;
  const highlight = useHighlightNow();
  const [pressed, setPressed] = React.useState<string | null>(null);

  const onLongPress = React.useCallback(
    (sentenceId: string) => {
      const mark = marks.get(sentenceId);
      if (mark) openEditor(mark.id);
      else setPressed(sentenceId);
    },
    [marks, openEditor],
  );

  const askAbout = async (sentenceId: string) => {
    const sentence = chapter?.sentences.find((x) => x.id === sentenceId);
    if (!book || !sentence) return;
    const paragraph = chapter?.paragraphs.find((p) => p.n === sentence.paragraph);
    const sessionId = await useChatStore.getState().createSession({
      bookId: book.bookId,
      title: sentence.text.slice(0, 60),
      contextText: paragraph?.text,
      passageText: sentence.text,
    });
    await showChatOnSamwellPage(sessionId);
    if (router.canDismiss()) router.dismissTo('/');
  };

  const onSelect = (key: FollowAlongMenuKey) => {
    const sentenceId = pressed;
    setPressed(null);
    if (!sentenceId) return;
    if (key === 'highlight') {
      if (chapter && book) void highlight({ bookId: book.bookId, chapter, sentenceId });
    }
    else if (key === 'ask') void askAbout(sentenceId);
    else {
      const text = chapter?.sentences.find((x) => x.id === sentenceId)?.text ?? '';
      void Clipboard.setStringAsync(text);
      showToast({ message: 'Copied', tone: 'success', key: 'book-text-copy' });
    }
  };

  return {
    marks,
    onLongPress,
    menu: { visible: pressed !== null, rows: MENU, onClose: () => setPressed(null), onSelect },
    editor: editor.menu,
  };
}
