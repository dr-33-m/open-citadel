import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { createArticleOfBookQueryOptions, invalidateBlogLibrary } from '@/query-manager/blogs';
import { setArticleFavorite } from '@/services/blogs/articles';
import { useBooksStore } from '@/stores/books';
import type { BookNowPlaying } from '@/stores/player';

/**
 * The player's star for what is being heard: a book's favourite as the
 * Library keeps it, or a blog post's own, the one its menu sets. A post's
 * reader copy is not one of the Library's books, so its star is the post's.
 */
export function useHeardFavorite(current: BookNowPlaying | null) {
  const bookId = current?.bookId ?? null;
  const post = current?.post ?? false;
  const bookFavorite = useBooksStore((s) => (bookId && !post ? s.books.find((b) => b.id === bookId)?.isFavorite === 1 : false));
  const article = useQuery(createArticleOfBookQueryOptions(bookId ?? '', { enabled: post && bookId !== null })).data ?? null;

  const toggle = React.useCallback(() => {
    if (!bookId) return;
    if (!post) void useBooksStore.getState().toggleFavorite(bookId);
    else if (article) void setArticleFavorite(article.id, !article.favorite).then(invalidateBlogLibrary);
  }, [bookId, post, article]);

  return { favorite: post ? (article?.favorite ?? false) : bookFavorite, toggle };
}
