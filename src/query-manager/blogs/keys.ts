import type { ArticleShelf, BlogArticleFilter } from '@/services/blogs/articles';

/** A shelf's own page: the post shelves, and the blogs followed. */
export type BlogSection = ArticleShelf | 'blogs';

/**
 * Every blog query's key.
 *
 * Everything read from the library (SQLite) sits under `library()`, so one
 * invalidation after a write refreshes whatever is on screen and marks the
 * rest to be read again when next shown. Work that writes (finding a blog on
 * the web and storing it) sits outside it, so a library change never runs it
 * again.
 */
export const blogKeys = {
  all: ['blogs'] as const,

  library: () => [...blogKeys.all, 'library'] as const,
  home: () => [...blogKeys.library(), 'home'] as const,
  section: (section: BlogSection) => [...blogKeys.library(), 'section', section] as const,
  followedFeeds: () => [...blogKeys.library(), 'followed-feeds'] as const,
  blog: (id: string) => [...blogKeys.library(), 'blog', id] as const,
  blogArticles: (id: string, filter: BlogArticleFilter) => [...blogKeys.blog(id), 'articles', filter] as const,
  /** The post a reader copy (a `books` row of kind `article`) was made from. */
  articleOfBook: (bookId: string) => [...blogKeys.library(), 'article-of-book', bookId] as const,
  /** Every post, for picking one to ask Samwell about. */
  askable: () => [...blogKeys.library(), 'askable'] as const,

  /** A blog found in Explore, fetched and stored: resolves to its id. */
  discovered: (feedUrl: string) => [...blogKeys.all, 'discovered', feedUrl] as const,
};
