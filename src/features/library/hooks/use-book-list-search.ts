import { usePageSearch, useSearchResults } from '@/hooks/use-page-search';
import type { Book } from '@/stores/books';

const bookFields = (book: Book) => [book.title, book.author];

/** A page's search over a list of books, by title or author. */
export function useBookListSearch(books: Book[]) {
  const search = usePageSearch();
  const results = useSearchResults(books, search, bookFields);
  return { ...search, results, emptyText: search.query ? 'No results.' : null };
}
