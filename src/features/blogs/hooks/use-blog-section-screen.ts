import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { useArticleActions } from '@/features/blogs/hooks/use-article-actions';
import { isBlogSection, SECTION_TITLES } from '@/features/blogs/utils/sections';
import { useDragOrder, type DragMove } from '@/hooks/use-drag-order';
import { usePageSearch, useSearchResults } from '@/hooks/use-page-search';
import { createBlogSectionQueryOptions, invalidateBlogLibrary, type BlogSection } from '@/query-manager/blogs';
import { markAllRead } from '@/services/blogs/articles';
import { exportBlogOpml } from '@/services/blogs/opml';
import { moveArticleInQueue } from '@/services/blogs/queue';
import type { ArticleItem, BlogItem } from '@/services/blogs/records';
import { countLabel } from '@/utils/format';

const NO_ARTICLES: ArticleItem[] = [];
const NO_BLOGS: BlogItem[] = [];

/** What the page draws under its search. */
export type BlogSectionView = 'blogs' | 'queue' | 'posts';

const articleKey = (article: ArticleItem) => article.id;
const saveMove = ({ id, to }: DragMove) => void moveArticleInQueue(id, to).then(invalidateBlogLibrary);
const articleFields = (article: ArticleItem) => [article.title, article.blogTitle, article.summary];
const blogFields = (blog: BlogItem) => [blog.title, blog.description];

/**
 * A blogs shelf's "View all": every post (or blog) on it, searchable, with
 * the count under the title and the shelf's one bulk action: marking the
 * latest posts read, or exporting the blogs followed. The queue is put in
 * order by dragging, except while a search narrows it.
 */
export function useBlogSectionScreen(type: string | undefined) {
  const router = useRouter();
  const section: BlogSection = isBlogSection(type) ? type : 'latest';
  const { data } = useQuery(createBlogSectionQueryOptions(section));
  const articles = useArticleActions();
  const search = usePageSearch();

  const allArticles = data?.articles ?? NO_ARTICLES;
  const allBlogs = data?.blogs ?? NO_BLOGS;
  const filteredArticles = useSearchResults(allArticles, search, articleFields);
  const filteredBlogs = useSearchResults(allBlogs, search, blogFields);

  const queue = useDragOrder(filteredArticles, articleKey, saveMove);

  const isBlogs = section === 'blogs';
  const view: BlogSectionView = isBlogs ? 'blogs' : section === 'queue' ? 'queue' : 'posts';
  const hasUnread = section === 'latest' && allArticles.some((a) => a.readAt === null);
  const markRead = React.useCallback(() => void markAllRead().then(invalidateBlogLibrary), []);
  const exportBlogs = React.useCallback(() => {
    void exportBlogOpml().catch(() => showToast({ message: 'The export could not be made.' }));
  }, []);

  return {
    title: SECTION_TITLES[section],
    subtitle: isBlogs ? countLabel(allBlogs.length, 'BLOG') : countLabel(allArticles.length, 'POST'),
    view,
    isBlogs,
    loaded: data !== undefined,
    articles: filteredArticles,
    /** The queue as the drag list draws it. */
    queue: { data: queue.items, onReorder: queue.onReorder, dragEnabled: !search.query.trim() },
    blogs: filteredBlogs,
    actions: articles,
    search,
    canSearch: (isBlogs ? allBlogs.length : allArticles.length) > 0,
    emptyText: search.query ? 'No results.' : 'Nothing here yet.',
    close: () => router.back(),
    /** Only when there is something to act on. */
    markAllRead: hasUnread ? markRead : null,
    exportBlogs: isBlogs && allBlogs.length > 0 ? exportBlogs : null,
  };
}
