import type { BookKind } from '@/db/schema';

/** Where the header's popover can take the reader from a chat. */
export type AttachmentOpenTarget = 'transcript' | 'passage' | 'book' | 'post';

/**
 * What the action in the header's popover opens, if anything. Pure.
 *
 * An episode chat opens its transcript, since there is no passage to go to. A
 * chat anchored to a passage opens the reader there. A chat about a whole book
 * opens the book where the reader left it. A chat about a whole post opens the
 * post, wherever its blog is read (`useOpenPost`): the reader, or its site.
 * Without its post (since removed from the library) a post's panel only says
 * what it is.
 */
export function attachmentOpenTarget(a: {
  kind: BookKind;
  /** The episode is known, so its transcript can open. */
  episode: boolean;
  /** The post is known, so it can open. */
  post: boolean;
  /** The chat is anchored to a place in the text. */
  passage: boolean;
}): AttachmentOpenTarget | null {
  if (a.kind === 'episode') return a.episode ? 'transcript' : null;
  if (a.passage) return 'passage';
  if (a.kind === 'article') return a.post ? 'post' : null;
  return 'book';
}

/** The action's words. Drawn as a small-caps label, so the case is the label's. */
export const ATTACHMENT_OPEN_LABEL: Record<AttachmentOpenTarget, string> = {
  transcript: 'Read the transcript',
  passage: 'Open at the passage',
  book: 'Open the book',
  post: 'Open the post',
};
