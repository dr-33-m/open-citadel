import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { useBookTextActions } from '@/features/audiobook/hooks/use-book-text-actions';
import { chapterTitle } from '@/features/audiobook/utils/chapter-title';
import { rowOf, sentenceRows, type SentenceRow } from '@/features/audiobook/utils/sentence-rows';
import { sectionOfId } from '@/features/audiobook/utils/sentences-of';
import { useFollowAlong } from '@/hooks/use-follow-along';
import { createChapterTextQueryOptions } from '@/query-manager/audiobook';
import { playFromSentence } from '@/services/audiobook';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook, usePlayer } from '@/stores/player';

const NO_ROWS: SentenceRow[] = [];

/**
 * The chapter over the book and its author; the book over its author when the
 * chapter has no name of its own. Until the chapter's text is read, the
 * chapter the player already names (`known`), so the header is right from
 * the first frame rather than the book's and then the chapter's.
 */
function textHeader(title: string | null | undefined, book: { title: string; author: string | null } | null, known: string | null) {
  const chapter = book ? (title === undefined ? known : chapterTitle(title, book.title)) : null;
  if (chapter) return { title: chapter, line: [book?.title, book?.author].filter(Boolean).join(' · ') };
  return { title: book?.title ?? 'Text', line: book?.author ?? '' };
}

/**
 * The book's text sheet, read like lyrics: the chapter being heard, a row a
 * sentence (as a transcript is a row a line), the one being spoken lit and
 * held a third of the way down (`useFollowAlong`), exactly as a transcript
 * follows its episode. The next chapter takes its place as the voice crosses
 * into it, and the list starts over there. A tap on any sentence goes there;
 * a long press highlights it, or opens its highlight (`useBookTextActions`).
 */
export function useBookText(visible: boolean) {
  const book = usePlayer(selectBook);
  const sentenceId = useAudiobook((s) => s.sentenceId);
  const bookId = book?.bookId ?? '';
  const section = sentenceId ? sectionOfId(sentenceId) : null;
  const query = useQuery(createChapterTextQueryOptions(bookId, section ?? -1, { enabled: visible && !!bookId && section !== null }));
  const chapter = query.data ?? null;
  const rows = React.useMemo(() => (chapter ? sentenceRows(chapter.sentences) : NO_ROWS), [chapter]);
  const current = rowOf(rows, sentenceId);

  const actions = useBookTextActions({ visible, book, chapter });
  const follow = useFollowAlong<SentenceRow>({ visible, current, resetKey: chapter?.index ?? null });
  const { from, following, follow: startFollowing } = follow;
  const data = React.useMemo(() => (from > 0 ? rows.slice(from) : rows), [rows, from]);

  const onSentence = React.useCallback(
    (id: string) => {
      startFollowing();
      useAudiobook.getState().patch({ sentenceId: id });
      void playFromSentence(id);
    },
    [startFollowing],
  );

  return {
    ...textHeader(chapter ? chapter.title : undefined, book, book?.chapterTitle ?? null),
    rows: data,
    lit: sentenceId,
    marks: actions.marks,
    onLongPress: actions.onLongPress,
    menu: actions.menu,
    editor: actions.editor,
    dim: following && current >= 0,
    loading: query.isPending && visible,
    listRef: follow.listRef,
    list: {
      listKey: `${chapter?.index ?? ''}:${follow.epoch}`,
      onDrag: follow.onDrag,
      onListLoad: follow.onListLoad,
      onStartReached: follow.onStartReached,
    },
    showBackToNow: !following && current >= 0,
    onBackToNow: startFollowing,
    onSentence,
  };
}

export type BookTextState = ReturnType<typeof useBookText>;
