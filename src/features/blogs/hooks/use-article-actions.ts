import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Share } from 'react-native';

import { showToast } from '@/components/toast/toast-provider';
import { useListen } from '@/features/audiobook/hooks/use-listen';
import { useListenState } from '@/features/audiobook/hooks/use-listen-state';
import { useOpenArticle } from '@/features/blogs/hooks/use-open-article';
import type { ArticleAction } from '@/features/blogs/utils/article-menu';
import { useSettledFocusEffect } from '@/navigation/use-settled-focus-effect';
import { createBlogArticlesQueryOptions, createBlogQueryOptions, invalidateBlogLibrary } from '@/query-manager/blogs';
import { listenItem } from '@/services/audiobook';
import { keepPostCover } from '@/services/blogs/post-cover';
import { setArticleFavorite, setArticleFinished, setArticleRead } from '@/services/blogs/articles';
import { setArticleQueued } from '@/services/blogs/queue';
import type { ArticleItem } from '@/services/blogs/records';

/**
 * A post's menu and what each of its rows does, for any screen that lists
 * posts. One implementation, so "Save for Later" on a shelf and on a blog's
 * page cannot come to mean different things. `ArticleSheets` draws the menu
 * and the sheets Listen can raise.
 */
export function useArticleActions() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { prepareArticle, openArticle, chatAboutArticle } = useOpenArticle();
  const listen = useListen();
  const { listen: startListening } = listen;
  const listenState = useListenState();
  const [menuArticle, setMenuArticle] = React.useState<ArticleItem | null>(null);

  // Heard as a book is: from its reader copy, made first as Read makes it.
  const listenTo = React.useCallback(
    async (article: ArticleItem) => {
      const bookId = await prepareArticle(article);
      // The notification draws the cover from the phone, as a book's.
      if (bookId) await keepPostCover(bookId);
      const item = bookId ? listenItem(bookId) : null;
      if (item) startListening(item);
    },
    [prepareArticle, startListening],
  );

  const openBlog = React.useCallback(
    (blogId: string) => {
      // The blog and its posts as the page first lists them, all of them.
      void queryClient.prefetchQuery(createBlogQueryOptions(blogId));
      void queryClient.prefetchQuery(createBlogArticlesQueryOptions(blogId, 'all'));
      router.push({ pathname: '/blogs/blog/[id]', params: { id: blogId } });
    },
    [queryClient, router],
  );
  // Back from the reader or a chat: the post is now read, and how far into
  // it the reader got (Continue Reading) was written by the reader, which
  // knows nothing of this cache. Read again once the slide back has settled,
  // never during it. Every screen that lists posts opens them through here.
  useSettledFocusEffect(invalidateBlogLibrary, { skipFirst: true });

  const openMenu = React.useCallback((article: ArticleItem) => setMenuArticle(article), []);
  const closeMenu = React.useCallback(() => setMenuArticle(null), []);

  const onAction = React.useCallback(
    (action: ArticleAction, article: ArticleItem) => {
      switch (action) {
        case 'open':
          void openArticle(article);
          return;
        case 'listen':
        case 'listen-locked':
          void listenTo(article);
          return;
        case 'chat':
          void chatAboutArticle(article);
          return;
        case 'favorite':
        case 'unfavorite':
          void setArticleFavorite(article.id, action === 'favorite').then(invalidateBlogLibrary);
          showToast({ message: action === 'favorite' ? 'Added to Favorites' : 'Removed from Favorites' });
          return;
        case 'queue':
        case 'dequeue':
          void setArticleQueued(article.id, action === 'queue').then(invalidateBlogLibrary);
          showToast({ message: action === 'queue' ? 'Added to Queue' : 'Removed from Queue' });
          return;
        case 'finish':
        case 'unfinish':
          void setArticleFinished(article.id, action === 'finish').then(invalidateBlogLibrary);
          return;
        case 'read':
        case 'unread':
          void setArticleRead(article.id, action === 'read').then(invalidateBlogLibrary);
          return;
        case 'original':
          void WebBrowser.openBrowserAsync(article.link).catch(() => {});
          return;
        case 'share':
          void Share.share({ message: `${article.title}\n${article.link}`, url: article.link }).catch(() => {});
          return;
        case 'blog':
          openBlog(article.blogId);
      }
    },
    [chatAboutArticle, listenTo, openArticle, openBlog],
  );

  return {
    openArticle,
    openBlog,
    openMenu,
    sheet: { visible: menuArticle !== null, article: menuArticle, listen: listenState, onClose: closeMenu, onAction },
    listen,
  };
}

export type ArticleActions = ReturnType<typeof useArticleActions>;
