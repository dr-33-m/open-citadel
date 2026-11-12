import React from 'react';

import type { RemovalCopy } from '@/components/confirm-remove-sheet';
import { showToast } from '@/components/toast/toast-provider';
import { COPY_IN_USE, COPY_REMOVED, removeCopyConfirm } from '@/features/blogs/utils/remove-copy';
import { invalidateBlogLibrary } from '@/query-manager/blogs';
import { copyHoldsWork, removeArticleCopy } from '@/services/blogs/article-copies';
import type { ArticleItem } from '@/services/blogs/records';

async function remove(articleId: string): Promise<void> {
  const removed = await removeArticleCopy(articleId);
  if (removed) invalidateBlogLibrary();
  showToast({ key: 'remove-copy', message: removed ? COPY_REMOVED : COPY_IN_USE });
}

/**
 * "Remove Saved Copy" on a post's menu. A copy with nothing of the reader's
 * on it goes at once (opening the post makes it again); one with highlights
 * or notes asks first, since those go with it.
 */
export function useRemoveCopy() {
  const [removing, setRemoving] = React.useState<ArticleItem | null>(null);
  const [visible, setVisible] = React.useState(false);

  const removeCopy = React.useCallback((article: ArticleItem) => {
    if (!article.bookId) return;
    if (!copyHoldsWork(article.bookId)) {
      void remove(article.id);
      return;
    }
    setRemoving(article);
    setVisible(true);
  }, []);

  const onConfirm = React.useCallback(() => {
    if (removing) void remove(removing.id);
  }, [removing]);
  const onClose = React.useCallback(() => setVisible(false), []);
  const copy: RemovalCopy | null = React.useMemo(
    () => (removing ? removeCopyConfirm(removing.title, removing.blogTitle) : null),
    [removing],
  );

  return { removeCopy, sheet: { visible, copy, onConfirm, onClose } };
}
