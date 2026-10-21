import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { paragraphRows, rowOf, type ParagraphRow } from '@/features/audiobook/utils/paragraph-rows';
import { sectionOfId } from '@/features/audiobook/utils/sentences-of';
import { useFollowAlong } from '@/hooks/use-follow-along';
import { createChapterTextQueryOptions } from '@/query-manager/audiobook';
import { playFromSentence } from '@/services/audiobook';
import { useAudiobook } from '@/stores/audiobook';
import { selectBook, usePlayer } from '@/stores/player';

const NO_ROWS: ParagraphRow[] = [];

/**
 * The book's text sheet, read like lyrics: the chapter being heard, a row a
 * paragraph, the sentence being spoken lit and held a third of the way down
 * (`useFollowAlong`). The next chapter takes its place as the voice crosses
 * into it, and the list starts over there. A tap on any sentence goes there.
 */
export function useBookText(visible: boolean) {
  const book = usePlayer(selectBook);
  const sentenceId = useAudiobook((s) => s.sentenceId);
  const bookId = book?.bookId ?? '';
  const section = sentenceId ? sectionOfId(sentenceId) : null;
  const query = useQuery(createChapterTextQueryOptions(bookId, section ?? -1, { enabled: visible && !!bookId && section !== null }));
  const chapter = query.data ?? null;
  const rows = React.useMemo(() => (chapter ? paragraphRows(chapter.sentences) : NO_ROWS), [chapter]);
  const current = rowOf(rows, sentenceId);

  const follow = useFollowAlong<ParagraphRow>({ visible, current, resetKey: chapter?.index ?? null });
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
    title: chapter?.title ?? book?.chapterTitle ?? 'Text',
    line: [book?.title, book?.author].filter(Boolean).join(' · '),
    rows: data,
    lit: sentenceId,
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
