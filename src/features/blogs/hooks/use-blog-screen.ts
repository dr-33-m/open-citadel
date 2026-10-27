import { useMutation, useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';

import { RotateCcw } from '@/components/icons';
import { showToast } from '@/components/toast/toast-provider';
import { usePageSearch, useSearchResults } from '@/hooks/use-page-search';
import type { BlogHeroProps } from '@/features/blogs/components/blog-hero';
import {
  createBlogArticlesQueryOptions,
  createBlogQueryOptions,
  createDiscoveredBlogQueryOptions,
  invalidateBlogLibrary,
} from '@/query-manager/blogs';
import type { BlogArticleFilter } from '@/services/blogs/articles';
import { followBlog, getBlog, unfollowBlog } from '@/services/blogs/blogs';
import { htmlToText } from '@/services/blogs/feed/text';
import type { ArticleItem } from '@/services/blogs/records';
import { refreshBlog } from '@/services/blogs/refresh';
import { countLabel } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { hostOf } from '@/utils/urls';

/** `id` is a blog's id, or `found` with the `feedUrl` Explore knew it by. */
export type BlogParams = { id: string; feedUrl?: string; title?: string };

const NO_ARTICLES: ArticleItem[] = [];

const articleFields = (a: ArticleItem) => [a.title, a.author, a.summary];

/** Reads the blog afresh and refreshes it, for a follow undone or a pull. */
async function refreshById(id: string): Promise<void> {
  const blog = await getBlog(id);
  if (blog) await refreshBlog(blog, true);
}

/**
 * A blog's page: the blog, its posts (all, or only the unread), and what its
 * buttons do. Opened from Explore, the blog is fetched and kept as a preview
 * once the slide has landed, so its posts can be read before following.
 */
export function useBlogScreen(params: BlogParams, landed: boolean) {
  const found = params.id === 'found' ? (params.feedUrl ?? null) : null;
  const discovered = useQuery(createDiscoveredBlogQueryOptions(found ?? '', { enabled: found !== null && landed }));
  const blogId = found ? (discovered.data ?? null) : params.id;
  const { data: blog } = useQuery(createBlogQueryOptions(blogId ?? '', { enabled: blogId !== null }));
  const [filter, setFilter] = React.useState<BlogArticleFilter>('all');
  const search = usePageSearch();
  // A search looks through every post, read or not.
  const articles = useQuery(
    createBlogArticlesQueryOptions(blogId ?? '', search.searching ? 'all' : filter, {
      enabled: blogId !== null && landed,
      // Keep the list on screen while the other filter is read.
      placeholderData: (previous) => previous,
    }),
  );

  const follow = useMutation({
    mutationFn: (id: string) => followBlog(id),
    onSuccess: () => {
      haptics.commit();
      invalidateBlogLibrary();
    },
  });
  const pull = useMutation({ mutationFn: refreshById, onSettled: invalidateBlogLibrary });

  const title = blog?.title ?? params.title ?? '';
  const unfollow = React.useCallback(() => {
    if (!blogId) return;
    void unfollowBlog(blogId).then(invalidateBlogLibrary);
    showToast({
      message: `Unfollowed ${title}`,
      actionIcon: RotateCcw,
      actionLabel: 'Undo',
      // Following again brings back the posts that went, on the next fetch.
      onActionPress: () => void followBlog(blogId).then(() => refreshById(blogId)).then(invalidateBlogLibrary),
    });
  }, [blogId, title]);
  const { mutate: followMutate } = follow;
  const onFollow = React.useCallback(() => {
    if (blogId) followMutate(blogId);
  }, [blogId, followMutate]);
  const { mutate: pullMutate, isPending: refreshing } = pull;
  const refresh = React.useCallback(() => {
    if (blogId && !refreshing) pullMutate(blogId);
  }, [blogId, pullMutate, refreshing]);
  const siteUrl = blog?.siteUrl ?? blog?.feedUrl ?? params.feedUrl ?? null;
  const openSite = React.useCallback(() => {
    if (siteUrl) void WebBrowser.openBrowserAsync(siteUrl).catch(() => {});
  }, [siteUrl]);

  const rawDescription = blog?.description ?? null;
  const description = React.useMemo(() => (rawDescription ? htmlToText(rawDescription) : null), [rawDescription]);

  const failed = found !== null && discovered.isError;
  const hero: BlogHeroProps = {
    title,
    host: siteUrl ? hostOf(siteUrl) : null,
    imageUrl: blog?.imageUrl ?? null,
    description,
    following: blog?.state === 'subscribed',
    loading: blogId === null && !failed,
    canFollow: blogId !== null,
    refreshError: failed ? (discovered.error?.message ?? 'This blog could not be reached.') : (blog?.lastRefreshError ?? null),
    filter,
    onFilter: setFilter,
    onFollow,
    onUnfollow: unfollow,
    onOpenSite: openSite,
  };

  // The posts are drawn once the slide has landed, never during it. Their read
  // is held until then too, but opening the blog from a list reads them ahead
  // at the tap (`useArticleActions`), and a cached answer would otherwise be
  // drawn into a page still moving.
  const shown = landed ? articles.data : undefined;
  const results = useSearchResults(shown ?? NO_ARTICLES, search, articleFields);
  const emptyText = search.query.trim()
    ? 'No posts match.'
    : filter === 'unread' && !search.searching
      ? 'Nothing unread here.'
      : 'No posts yet.';

  return {
    hero,
    articles: results,
    search,
    /** "12 POSTS" over a search's results, in the hero's place. */
    resultsCount: countLabel(results.length, 'POST'),
    /** Still finding the blog, reading its posts or sliding in: the list shows its skeleton. */
    resolving: !failed && shown === undefined,
    emptyText,
    /** Only a stored blog has posts to search, and only one not being searched is pulled for new ones. */
    canSearch: blogId !== null,
    canRefresh: blogId !== null && !search.searching,
    refreshing,
    refresh,
  };
}
