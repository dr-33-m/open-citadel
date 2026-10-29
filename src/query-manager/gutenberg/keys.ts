/** Project Gutenberg's catalog: shelves, searches and books. Network reads, cached by time. */
export const gutenbergKeys = {
  all: ['gutenberg'] as const,
  shelf: (shelfId: string) => [...gutenbergKeys.all, 'shelf', shelfId] as const,
  shelfSearch: (shelfId: string, term: string) => [...gutenbergKeys.all, 'shelf-search', shelfId, term] as const,
  shelfPreview: (shelfId: string) => [...gutenbergKeys.all, 'shelf-preview', shelfId] as const,
  search: (term: string) => [...gutenbergKeys.all, 'search', term] as const,
  book: (id: number) => [...gutenbergKeys.all, 'book', id] as const,
};
