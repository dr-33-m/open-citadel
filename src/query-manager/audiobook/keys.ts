/**
 * Every audiobook query's key. All of it is read from this phone (the book's
 * text index and its saved place), so it sits under one parent key.
 */
export const audiobookKeys = {
  all: ['audiobook'] as const,
  chapter: (bookId: string, index: number) => [...audiobookKeys.all, 'chapter', bookId, index] as const,
  listen: (bookId: string) => [...audiobookKeys.all, 'listen', bookId] as const,
  /** Every book's highlights, for one invalidation when any highlight changes. */
  allHighlights: () => [...audiobookKeys.all, 'highlights'] as const,
  highlights: (bookId: string) => [...audiobookKeys.allHighlights(), bookId] as const,
};
