import React from 'react';

import { ListenSheets } from '@/features/audiobook/components/listen-sheets';
import { ArticleActionSheet } from '@/features/blogs/components/article-action-sheet';
import type { ArticleActions } from '@/features/blogs/hooks/use-article-actions';

/** A post's menu and the sheets its Listen can raise, from `useArticleActions`, as `BookSheets` is a book's. */
export function ArticleSheets({ actions, blogLink }: { actions: ArticleActions; blogLink?: boolean }) {
  return (
    <>
      <ArticleActionSheet {...actions.sheet} blogLink={blogLink} />
      <ListenSheets listen={actions.listen} />
    </>
  );
}
