/**
 * How a sentence of a book is named in the native player's queue:
 * `audiobook:<bookId>:<sentenceId>`. Episodes are named by their own id, so
 * the prefix is what tells the two apart in every event.
 *
 * Pure, so it can be tested on its own.
 */
const PREFIX = 'audiobook:';

export function bookMediaId(bookId: string, sentenceId: string): string {
  return `${PREFIX}${bookId}:${sentenceId}`;
}

export function isBookItem(mediaId: string | null | undefined): boolean {
  return !!mediaId && mediaId.startsWith(PREFIX);
}

/** The book and sentence a queue item is, or null for anything else. A sentence id is the last three parts. */
export function parseBookMediaId(mediaId: string | null | undefined): { bookId: string; sentenceId: string } | null {
  if (!isBookItem(mediaId)) return null;
  const parts = (mediaId as string).slice(PREFIX.length).split(':');
  if (parts.length < 4) return null;
  return { bookId: parts.slice(0, -3).join(':'), sentenceId: parts.slice(-3).join(':') };
}
