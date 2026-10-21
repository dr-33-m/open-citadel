import type { UseQueryOptions } from '@tanstack/react-query';

import { audiobookKeys } from '@/query-manager/audiobook/keys';
import { chapterText, listenFigures, type ChapterText, type ListenFigures } from '@/services/audiobook/text';

type Options<T, TData = T> = Omit<UseQueryOptions<T, Error, TData>, 'queryKey' | 'queryFn'>;

/** Read from the phone and changed only by the app's own writes. */
const LOCAL = { staleTime: Infinity, gcTime: 5 * 60_000, networkMode: 'always', retry: false } as const;

/** A chapter's paragraphs and sentences, for the follow-along sheet. The text never changes under a book. */
export function createChapterTextQueryOptions(bookId: string, index: number, options?: Options<ChapterText | null>) {
  return {
    ...LOCAL,
    ...options,
    queryKey: audiobookKeys.chapter(bookId, index),
    queryFn: () => chapterText(bookId, index),
  } satisfies UseQueryOptions<ChapterText | null>;
}

/** How much of a book is left to hear, for the Listen sheet. Read fresh each time the sheet opens. */
export function createListenFiguresQueryOptions(bookId: string, options?: Options<ListenFigures | null>) {
  return {
    ...LOCAL,
    staleTime: 0,
    ...options,
    queryKey: audiobookKeys.listen(bookId),
    queryFn: () => listenFigures(bookId),
  } satisfies UseQueryOptions<ListenFigures | null>;
}
