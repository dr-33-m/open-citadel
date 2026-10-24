import { and, desc, eq, isNotNull, isNull, like, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { blogArticles, blogs } from '@/db/schema';
import type { BlogSummary, PostSummary } from '@/services/listening-tools/blog-format';
import { filterTerms, isEmptyQuery, parseSearchQuery, rankByMatch } from '@/utils/search-terms';

const count = (condition: SQL) => sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`;

/** Posts returned at most, and fetched for the ranking to choose from when there are words to rank by. */
const POSTS_SHOWN = 40;
const POST_POOL = 400;

/** Every blog they follow, each with what they have done with its posts. */
export function listBlogs(query: string | undefined): BlogSummary[] {
  const rows = db
    .select({
      id: blogs.id,
      title: blogs.title,
      state: blogs.state,
      posts: sql<number>`count(${blogArticles.id})`,
      read: count(sql`${blogArticles.readAt} is not null`),
      finished: count(sql`${blogArticles.finishedAt} is not null`),
      queued: count(sql`${blogArticles.savedAt} is not null`),
      favorites: count(sql`${blogArticles.favoritedAt} is not null`),
      lastReadAt: sql<string | null>`max(${blogArticles.readAt})`,
    })
    .from(blogs)
    .leftJoin(blogArticles, eq(blogArticles.blogId, blogs.id))
    .where(eq(blogs.state, 'subscribed'))
    .groupBy(blogs.id)
    .all()
    .map(({ state, ...row }) => ({ ...row, following: state === 'subscribed' }))
    .sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? '') || a.title.localeCompare(b.title));

  const parsed = parseSearchQuery(query ?? '');
  return isEmptyQuery(parsed) ? rows : rankByMatch(rows, parsed, (blog) => blog.title);
}

export interface PostSearch {
  query?: string;
  blog?: string;
  status?: 'unread' | 'read' | 'finished';
  queued?: boolean;
  favorites?: boolean;
}

const STATUS: Record<NonNullable<PostSearch['status']>, SQL> = {
  unread: isNull(blogArticles.readAt),
  read: isNotNull(blogArticles.readAt),
  finished: isNotNull(blogArticles.finishedAt),
};

/**
 * Posts by words, blog and what was done with them: most recently read first
 * (then newest), or the best matches first when there are words. Posts from a
 * blog only previewed are left out unless they were read: what they follow
 * and what they read is their library, a stranger's archive is not.
 */
export function searchPosts(search: PostSearch): { posts: PostSummary[]; total: number } {
  const conditions: (SQL | undefined)[] = [or(eq(blogs.state, 'subscribed'), isNotNull(blogArticles.readAt))];
  const parsed = parseSearchQuery(search.query ?? '');
  const terms = filterTerms(parsed);
  if (terms.length > 0) {
    conditions.push(
      or(
        ...terms.flatMap((term) => [
          like(blogArticles.title, `%${term}%`),
          like(blogArticles.summary, `%${term}%`),
          like(blogArticles.author, `%${term}%`),
          like(blogs.title, `%${term}%`),
        ]),
      ),
    );
  }
  for (const word of (search.blog ?? '').trim().split(/\s+/).filter(Boolean)) conditions.push(like(blogs.title, `%${word}%`));
  if (search.status) conditions.push(STATUS[search.status]);
  if (search.queued) conditions.push(isNotNull(blogArticles.savedAt));
  if (search.favorites) conditions.push(isNotNull(blogArticles.favoritedAt));

  const where = and(...conditions);
  const total =
    db
      .select({ n: sql<number>`count(*)` })
      .from(blogArticles)
      .innerJoin(blogs, eq(blogs.id, blogArticles.blogId))
      .where(where)
      .get()?.n ?? 0;
  const rows = db
    .select({
      id: blogArticles.id,
      blog: blogs.title,
      title: blogArticles.title,
      author: blogArticles.author,
      publishedAt: blogArticles.publishedAt,
      readAt: blogArticles.readAt,
      finishedAt: blogArticles.finishedAt,
      queuedAt: blogArticles.savedAt,
      favoritedAt: blogArticles.favoritedAt,
      bookId: blogArticles.bookId,
      summary: blogArticles.summary,
    })
    .from(blogArticles)
    .innerJoin(blogs, eq(blogs.id, blogArticles.blogId))
    .where(where)
    .orderBy(desc(sql`coalesce(${blogArticles.readAt}, '')`), desc(blogArticles.publishedAt))
    .limit(terms.length > 0 ? POST_POOL : POSTS_SHOWN)
    .all()
    .map(({ bookId, ...row }) => ({ ...row, openedInReader: bookId !== null }));

  const ranked = terms.length > 0 ? rankByMatch(rows, parsed, (p) => `${p.title} ${p.blog} ${p.author ?? ''} ${p.summary ?? ''}`) : rows;
  // Ranked from a pool: when the pool held every row, what matched is the count; otherwise the database's is.
  const matched = terms.length > 0 && rows.length < POST_POOL ? ranked.length : total;
  return { posts: ranked.slice(0, POSTS_SHOWN), total: matched };
}
