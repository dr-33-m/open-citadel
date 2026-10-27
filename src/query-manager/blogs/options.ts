import type { UseQueryOptions } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';
import { blogKeys, type BlogSection } from '@/query-manager/blogs/keys';
import { openDiscoveredBlog } from '@/services/blogs/actions';
import { articleOfBook, listAskableArticles, listBlogArticles, listShelf, type ArticleShelf, type BlogArticleFilter } from '@/services/blogs/articles';
import { followedFeedUrls, getBlog, listFollowedBlogs } from '@/services/blogs/blogs';
import type { ArticleItem, Blog, BlogItem } from '@/services/blogs/records';
import { sameSet } from '@/utils/sets';

type Options<T, TData = T> = Omit<UseQueryOptions<T, Error, TData>, 'queryKey' | 'queryFn'>;

/**
 * The library lives on the device and only changes when the app writes to it,
 * and every write invalidates `blogKeys.library()`. So its reads never go
 * stale on a timer, and never wait for a network.
 */
const LIBRARY = { staleTime: Infinity, gcTime: 5 * 60_000, networkMode: 'always', retry: false } as const;

/** How many of each list a home shelf draws; "View all" has the rest. */
export const HOME_SHELF_LIMIT = 15;
/** The newest posts listed on the Blogs page itself. */
export const HOME_LATEST_LIMIT = 8;
/** A long list's cap: nobody scrolls further, and the rows are held in memory. */
const LONG_LIST_LIMIT = 500;

const HOME_SHELVES: ArticleShelf[] = ['continue', 'latest', 'queue', 'favorites', 'finished'];

export type BlogsHomeData = {
  blogs: BlogItem[];
  shelves: Record<ArticleShelf, ArticleItem[]>;
};

/** Everything the Blogs page draws. The reads overlap: none needs another's answer. */
export function createBlogsHomeQueryOptions<TData = BlogsHomeData>(options?: Options<BlogsHomeData, TData>) {
  return {
    ...LIBRARY,
    ...options,
    queryKey: blogKeys.home(),
    queryFn: async (): Promise<BlogsHomeData> => {
      const [blogs, ...lists] = await Promise.all([
        listFollowedBlogs(),
        ...HOME_SHELVES.map((shelf) => listShelf(shelf, shelf === 'latest' ? HOME_LATEST_LIMIT : HOME_SHELF_LIMIT)),
      ]);
      const shelves = Object.fromEntries(HOME_SHELVES.map((key, i) => [key, lists[i]])) as BlogsHomeData['shelves'];
      return { blogs, shelves };
    },
  } satisfies UseQueryOptions<BlogsHomeData, Error, TData>;
}

export type BlogSectionData = { articles: ArticleItem[]; blogs: BlogItem[] };

/** A whole shelf, for its "View all". */
export function createBlogSectionQueryOptions<TData = BlogSectionData>(
  section: BlogSection,
  options?: Options<BlogSectionData, TData>,
) {
  return {
    ...LIBRARY,
    ...options,
    queryKey: blogKeys.section(section),
    queryFn: async (): Promise<BlogSectionData> =>
      section === 'blogs'
        ? { articles: [], blogs: await listFollowedBlogs() }
        : { articles: await listShelf(section, LONG_LIST_LIMIT), blogs: [] },
  } satisfies UseQueryOptions<BlogSectionData, Error, TData>;
}

/** Every post, for Samwell's post picker. */
export function createAskableArticlesQueryOptions<TData = ArticleItem[]>(options?: Options<ArticleItem[], TData>) {
  return {
    ...LIBRARY,
    ...options,
    queryKey: blogKeys.askable(),
    queryFn: () => listAskableArticles(LONG_LIST_LIMIT),
  } satisfies UseQueryOptions<ArticleItem[], Error, TData>;
}

/** A followed blog already read by the Blogs page or its "View all". Undefined when neither has it. */
function cachedBlog(id: string): { blog: Blog; at: number } | undefined {
  for (const key of [blogKeys.home(), blogKeys.section('blogs')]) {
    const state = queryClient.getQueryState<BlogsHomeData | BlogSectionData>(key);
    const blog = state?.data?.blogs.find((b) => b.id === id);
    if (blog) return { blog, at: state!.dataUpdatedAt };
  }
  return undefined;
}

/**
 * One blog. Seeded from a list that already holds it, so a blog's page opened
 * from the Library draws its hero in its first frame rather than a few frames
 * into the slide. Seeded data is as fresh as the list it came from; every
 * write invalidates both.
 */
export function createBlogQueryOptions(id: string, options?: Options<Blog | null>) {
  return {
    ...LIBRARY,
    initialData: () => cachedBlog(id)?.blog,
    initialDataUpdatedAt: () => cachedBlog(id)?.at,
    ...options,
    queryKey: blogKeys.blog(id),
    queryFn: () => getBlog(id),
  } satisfies UseQueryOptions<Blog | null>;
}

export function createBlogArticlesQueryOptions(id: string, filter: BlogArticleFilter, options?: Options<ArticleItem[]>) {
  return {
    ...LIBRARY,
    ...options,
    queryKey: blogKeys.blogArticles(id, filter),
    queryFn: () => listBlogArticles(id, filter, LONG_LIST_LIMIT),
  } satisfies UseQueryOptions<ArticleItem[]>;
}

/** The feeds already followed, so Explore can mark them. */
export function createFollowedFeedsQueryOptions(options?: Options<Set<string>>) {
  return {
    ...LIBRARY,
    // A set does not share structure on its own: without this every library
    // change handed Explore a new one and redrew every tile.
    structuralSharing: (previous: unknown, next: unknown) => {
      const before = previous as Set<string> | undefined;
      return before && sameSet(before, next as Set<string>) ? before : next;
    },
    ...options,
    queryKey: blogKeys.followedFeeds(),
    queryFn: followedFeedUrls,
  } satisfies UseQueryOptions<Set<string>>;
}

/**
 * A blog found in Explore, fetched and stored as a preview: resolves to its
 * id. Outside the library key on purpose: it writes, and must not run again
 * because the library changed. Checked again whenever a blog page opens
 * (`staleTime: 0`), which is cheap, since a stored blog returns from the
 * database without a fetch: the same reasoning as a podcast from Explore.
 */
export function createDiscoveredBlogQueryOptions(feedUrl: string, options?: Options<string>) {
  return {
    staleTime: 0,
    gcTime: 60 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    ...options,
    queryKey: blogKeys.discovered(feedUrl),
    queryFn: ({ signal }) => openDiscoveredBlog(feedUrl, signal),
  } satisfies UseQueryOptions<string>;
}

/** The post a reader copy was made from (its id and favourite), for the player's star while it is heard. */
export function createArticleOfBookQueryOptions(bookId: string, options?: Options<Awaited<ReturnType<typeof articleOfBook>>>) {
  return {
    ...LIBRARY,
    ...options,
    queryKey: blogKeys.articleOfBook(bookId),
    queryFn: () => articleOfBook(bookId),
  } satisfies UseQueryOptions<Awaited<ReturnType<typeof articleOfBook>>>;
}
