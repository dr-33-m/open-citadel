import type { BookKind } from '@/db/schema';

/** Where the header's popover can take the reader from a chat. */
export type AttachmentOpenTarget = 'transcript' | 'passage' | 'book';

/**
 * What the action in the header's popover opens, if anything. Pure.
 *
 * An episode chat opens its transcript, since there is no passage to go to. A
 * chat anchored to a passage opens the reader there. A chat about a whole book
 * opens the book where the reader left it. A post with no passage has nowhere
 * better to go than the chat it is already in, so its panel only says what it
 * is.
 */
export function attachmentOpenTarget(a: {
  kind: BookKind;
  /** The episode is known, so its transcript can open. */
  episode: boolean;
  /** The chat is anchored to a place in the text. */
  passage: boolean;
}): AttachmentOpenTarget | null {
  if (a.kind === 'episode') return a.episode ? 'transcript' : null;
  if (a.passage) return 'passage';
  return a.kind === 'book' ? 'book' : null;
}

/** The action's words. Drawn as a small-caps label, so the case is the label's. */
export const ATTACHMENT_OPEN_LABEL: Record<AttachmentOpenTarget, string> = {
  transcript: 'Read the transcript',
  passage: 'Open at the passage',
  book: 'Open the book',
};
