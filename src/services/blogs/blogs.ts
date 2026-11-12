/**
 * Blogs: what someone follows, one blog's details, and following or leaving
 * one. A blog opened from Explore and not followed is kept as a `preview`, so
 * its posts can be opened (and highlighted) before deciding.
 */
import { and, asc, eq, inArray, isNull, lt, not, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { blogArticles, blogs, type BlogState, type WholePosts } from '@/db/schema';
import { releaseBlogCopies } from '@/services/blogs/article-copies';
import { keptOnPurpose } from '@/services/blogs/articles';
import type { DiscoveredBlog } from '@/services/blogs/discover';
import type { Blog, BlogItem } from '@/services/blogs/records';
import { storeArticles } from '@/services/blogs/store-articles';
import { newId, nowIso } from '@/services/rows';

/**
 * Posts published since the blog was followed and not yet read. Not every
 * unread post: a blog followed today arrives with its last twenty, and a
 * badge of twenty on day one says nothing. The backlog is still marked
 * unread wherever it is listed.
 */
const NEW_COUNT = sql<number>`(
  select count(*) from ${blogArticles}
  where ${blogArticles.blogId} = ${blogs.id}
    and ${blogArticles.readAt} is null
    and ${blogArticles.publishedAt} >= coalesce(${blogs.subscribedAt}, '9999')
)`.mapWith(Number);

/** Everything followed: blogs with something new first, then by name. */
export async function listFollowedBlogs(): Promise<BlogItem[]> {
  const rows = await db
    .select({ blog: blogs, newCount: NEW_COUNT })
    .from(blogs)
    .where(eq(blogs.state, 'subscribed'))
    .orderBy(sql`case when ${NEW_COUNT} > 0 then 0 else 1 end`, asc(sql`lower(${blogs.title})`));
  return rows.map((r) => ({ ...r.blog, newCount: r.newCount }));
}

export async function getBlog(id: string): Promise<Blog | null> {
  const rows = await db.select().from(blogs).where(eq(blogs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function followedFeedUrls(): Promise<Set<string>> {
  const rows = await db.select({ feedUrl: blogs.feedUrl }).from(blogs).where(eq(blogs.state, 'subscribed'));
  return new Set(rows.map((r) => r.feedUrl));
}

/**
 * Stores a blog found by address or in Explore, with its posts, and returns
 * its id. A blog already in the library keeps its state unless it is being
 * followed now; its details and posts are brought up to date either way.
 */
export async function storeDiscoveredBlog(found: DiscoveredBlog, state: BlogState): Promise<string> {
  const now = nowIso();
  const existing = (await db.select().from(blogs).where(eq(blogs.feedUrl, found.feedUrl)).limit(1))[0];
  const details = {
    title: found.blog.title,
    siteUrl: found.blog.siteUrl,
    description: found.blog.description,
    imageUrl: found.blog.imageUrl,
    language: found.blog.language,
    rights: found.blog.rights,
    lastRefreshAt: now,
    lastRefreshError: null,
    httpValidator: found.validator,
  };
  let id: string;
  if (existing) {
    id = existing.id;
    const following = state === 'subscribed' && existing.state !== 'subscribed';
    await db
      .update(blogs)
      .set({ ...details, ...(following ? { state, subscribedAt: now } : {}) })
      .where(eq(blogs.id, id));
  } else {
    id = newId();
    await db.insert(blogs).values({
      id,
      feedUrl: found.feedUrl,
      ...details,
      state,
      subscribedAt: state === 'subscribed' ? now : null,
      createdAt: now,
    });
  }
  await storeArticles(id, found.blog.articles);
  return id;
}

export async function followBlog(id: string): Promise<void> {
  await db.update(blogs).set({ state: 'subscribed', subscribedAt: nowIso() }).where(eq(blogs.id, id));
}

/**
 * Stops following. Posts kept on purpose stay (queued, favorites, finished,
 * or with highlights, notes or a chat on their copy); the rest go, reader
 * copies included (`releaseBlogCopies`). The blog stays as a preview while it
 * holds any, so they can still be listed.
 */
export async function unfollowBlog(id: string): Promise<void> {
  await releaseBlogCopies(id);
  db.transaction((tx) => {
    tx.delete(blogArticles)
      .where(and(eq(blogArticles.blogId, id), not(keptOnPurpose)))
      .run();
    tx.update(blogs).set({ state: 'preview', subscribedAt: null }).where(eq(blogs.id, id)).run();
  });
  // Not tidied away here: the next refresh does that, which leaves an undo
  // right after unfollowing something to come back to.
}

/** How the reader chose to read a blog whose feed carries only openings (`WholePosts`). */
export async function setBlogWholePosts(id: string, wholePosts: WholePosts): Promise<void> {
  await db.update(blogs).set({ wholePosts }).where(eq(blogs.id, id));
}

/** How long a blog opened from Explore and not followed is kept: a week, as for podcasts. */
const PREVIEW_TTL_MS = 7 * 24 * 3600 * 1000;

/**
 * Lets go of previews nobody followed: after a week, unless a post in them
 * was kept on purpose. The database does not cascade, so posts go first.
 */
export async function pruneStalePreviews(): Promise<void> {
  const cutoff = new Date(Date.now() - PREVIEW_TTL_MS).toISOString();
  const stale = await db
    .select({ id: blogs.id })
    .from(blogs)
    .where(
      and(
        eq(blogs.state, 'preview'),
        or(isNull(blogs.lastRefreshAt), lt(blogs.lastRefreshAt, cutoff)),
        sql`not exists (
          select 1 from ${blogArticles}
          where ${blogArticles.blogId} = ${blogs.id} and ${keptOnPurpose}
        )`,
      ),
    );
  if (stale.length === 0) return;
  const ids = stale.map((s) => s.id);
  db.transaction((tx) => {
    tx.delete(blogArticles).where(inArray(blogArticles.blogId, ids)).run();
    tx.delete(blogs).where(inArray(blogs.id, ids)).run();
  });
}
