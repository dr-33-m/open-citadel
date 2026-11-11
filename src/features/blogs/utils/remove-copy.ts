/** The words for removing a post's saved copy. Pure. */
import type { RemovalCopy } from '@/components/confirm-remove-sheet';

/** Asked only when the copy holds highlights or notes, which go with it. */
export function removeCopyConfirm(title: string, blogTitle: string): RemovalCopy {
  return {
    title: 'Remove Saved Copy',
    lead: 'Your highlights and notes on',
    subject: title,
    rest: `go with its copy. The post stays in ${blogTitle}, to open again.`,
    confirmLabel: 'REMOVE',
  };
}

export const COPY_REMOVED = 'Removed the saved copy';

/** It is playing, or open: the copy is what is being read from. */
export const COPY_IN_USE = 'This post is playing now. Stop it, then remove its copy.';
