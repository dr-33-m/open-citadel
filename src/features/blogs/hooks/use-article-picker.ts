import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { useOpenArticle } from '@/features/blogs/hooks/use-open-article';
import { createAskableArticlesQueryOptions } from '@/query-manager/blogs';
import type { ArticleItem } from '@/services/blogs/records';

type PickedArticle = { id: string; title: string; kind: 'article' };

/**
 * Samwell's post picker: the posts it lists (read only once it has been
 * opened), and picking one, which makes the post's reader copy first, since
 * that copy is what the chat is grounded in. Whether it is open is the
 * caller's (the Samwell page's sheet store), so the button that opens it and
 * the sheet itself need not be drawn by the same component.
 */
export function useArticlePicker(visible: boolean, onClose: () => void, onPicked: (post: PickedArticle) => void) {
  const { data } = useQuery({ ...createAskableArticlesQueryOptions(), enabled: visible });
  const { prepareArticle } = useOpenArticle();

  const close = onClose;
  const select = React.useCallback(
    async (article: ArticleItem) => {
      onClose();
      const bookId = await prepareArticle(article);
      if (bookId) onPicked({ id: bookId, title: article.title, kind: 'article' });
    },
    [onClose, onPicked, prepareArticle],
  );

  return { visible, articles: data, onSelect: select, onClose: close };
}
