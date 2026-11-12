import React from 'react';

import { ConfirmRemoveSheet } from '@/components/confirm-remove-sheet';
import { ListenSheets } from '@/features/audiobook/components/listen-sheets';
import { ArticleActionSheet } from '@/features/blogs/components/article-action-sheet';
import { WholePostsSheet } from '@/features/blogs/components/whole-posts-sheet';
import type { ArticleActions } from '@/features/blogs/hooks/use-article-actions';

/**
 * A post's menu and the sheets its rows can raise (Listen's, removing a saved
 * copy, and how a summary-only blog is read), from `useArticleActions`, as
 * `BookSheets` is a book's.
 */
export function ArticleSheets({ actions, blogLink }: { actions: ArticleActions; blogLink?: boolean }) {
  return (
    <>
      <ArticleActionSheet {...actions.sheet} blogLink={blogLink} />
      <ListenSheets listen={actions.listen} />
      <ConfirmRemoveSheet {...actions.removal} />
      <WholePostsSheet {...actions.wholePosts} />
    </>
  );
}
