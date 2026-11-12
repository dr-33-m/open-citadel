import type { MenuRow } from '@/components/menu-list';
import type { Book } from '@/stores/books';

export type BookMenuAction =
  | 'open'
  | 'listen'
  | 'listen-locked'
  | 'favorite'
  | 'unfavorite'
  | 'collection'
  | 'stop-reading'
  | 'queue'
  | 'dequeue'
  | 'finish'
  | 'unfinish'
  | 'rename'
  | 'delete';

export type BookMenuOptions = {
  collections: boolean;
  rename: boolean;
  delete: boolean;
  /** Listening in a cloud voice: open with a plan that reaches one, locked without. Left out where not offered. */
  listen?: 'open' | 'locked' | null;
};

/** A book that can be heard: an EPUB being read, with its file on the phone. */
export function canListen(book: Book): boolean {
  return book.status === 'reading' && (book.kind ?? 'book') === 'book' && !!book.filePath;
}

/** What can be done to a book in the state it is in, in menu order. */
export function bookMenu(book: Book, options: BookMenuOptions): MenuRow<BookMenuAction>[] {
  const archived = book.status === 'archived';
  const queued = book.status === 'queued';
  const rows: MenuRow<BookMenuAction>[] = [{ key: 'open', label: 'Open' }];
  if (options.listen && canListen(book)) {
    rows.push(options.listen === 'open' ? { key: 'listen', label: 'Listen' } : { key: 'listen-locked', label: 'Listen', tone: 'muted' });
  }
  rows.push(
    book.isFavorite === 1
      ? { key: 'unfavorite', label: 'Remove from Favorites' }
      : { key: 'favorite', label: 'Add to Favorites' },
  );
  if (options.collections) rows.push({ key: 'collection', label: 'Add to Collection' });
  if (book.status === 'reading') rows.push({ key: 'stop-reading', label: 'Remove from Continue Reading' });
  if (!queued && !archived) rows.push({ key: 'queue', label: 'Add to Queue' });
  if (queued) rows.push({ key: 'dequeue', label: 'Remove from Queue' });
  rows.push(
    archived
      ? { key: 'unfinish', label: 'Mark as Unfinished', tone: 'muted' }
      : { key: 'finish', label: 'Mark as Finished', tone: 'gold' },
  );
  if (options.rename) rows.push({ key: 'rename', label: 'Edit Title' });
  if (options.delete) rows.push({ key: 'delete', label: 'Delete Book', tone: 'destructive' });
  return rows;
}
