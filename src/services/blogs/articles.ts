/**
 * Posts: the lists the Blogs side draws, one post, and marking one read,
 * queued, a favorite or finished. Lists never carry a post's HTML; only
 * opening one reads it.
 */
import { and, asc, desc, eq, getTableColumns, gt, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { blogArticles, blogs, readingProgress } from '@/db/schema';
import type { ArticleItem, Blog, BlogArticle } from '@/services/blogs/records';
import { nowIso } from '@/services/rows';

/**
 * `latest`: every followed blog's posts, newest first. `continue`: posts
 * opened and left part-read. `queue`: kept to read later, in the order they
 * were added. `favorites`: latest first. `finished`: most recently finished
 * first.
 */
export type ArticleShelf = 'latest' | 'continue' | 'queue' | 'favorites' | 'finished';
export type BlogArticleFilter = 'all' | 'unread';

const { contentHtml: _html, ...ITEM_COLUMNS } = getTableColumns(blogArticles);
const ITEM = { ...ITEM_COLUMNS, blogTitle: blogs.title, blogImageUrl: blogs.imageUrl, progress: readingProgress.percentage };

/** Read far enough to be under way, and not so far it is finished. */
const STARTED = 0.02;
const FINISHED = 0.95;

/**
 * A post kept on purpose: queued, a favorite, finished, or opened (a
 * highlight lives on the opened copy). Tidying a blog's old posts away, and
 * letting go of a preview nobody followed, both leave these alone.
 */
export const keptOnPurpose: SQL = sql`(${blogArticles.savedAt} is not null
  or ${blogArticles.favoritedAt} is not null
  or ${blogArticles.finishedAt} is not null
  or ${blogArticles.bookId} is not null)`;

function select(where: SQL | undefined, order: SQL[], limit: number) {
  return db
    .select(ITEM)
    .from(blogArticles)
    .innerJoin(blogs, eq(blogs.id, blogArticles.blogId))
    .leftJoin(readingProgress, eq(readingProgress.bookId, blogArticles.bookId))
    .where(where)
    .orderBy(...order)
    .limit(limit);
}

export async function listShelf(shelf: ArticleShelf, limit: number): Promise<ArticleItem[]> {
  switch (shelf) {
    case 'latest':
      return select(eq(blogs.state, 'subscribed'), [desc(blogArticles.publishedAt)], limit);
    case 'queue':
      return select(isNotNull(blogArticles.savedAt), [asc(blogArticles.savedAt)], limit);
    case 'favorites':
      return select(isNotNull(blogArticles.favoritedAt), [desc(blogArticles.favoritedAt)], limit);
    case 'finished':
      return select(isNotNull(blogArticles.finishedAt), [desc(blogArticles.finishedAt)], limit);
    case 'continue':
      return select(
        and(
          isNotNull(blogArticles.bookId),
          isNull(blogArticles.finishedAt),
          gt(readingProgress.percentage, STARTED),
          lt(readingProgress.percentage, FINISHED),
        ),
        [desc(readingProgress.updatedAt)],
        limit,
      );
  }
}

/**
 * Every post there is to ask Samwell about: those being read first, the most
 * recently read at the top, then the rest, newest first.
 */
export async function listAskableArticles(limit: number): Promise<ArticleItem[]> {
  const unopened = sql`${readingProgress.updatedAt} is null`;
  return select(undefined, [unopened, desc(readingProgress.updatedAt), desc(blogArticles.publishedAt)], limit);
}

export async function listBlogArticles(blogId: string, filter: BlogArticleFilter, limit: number): Promise<ArticleItem[]> {
  const where = and(eq(blogArticles.blogId, blogId), filter === 'unread' ? isNull(blogArticles.readAt) : undefined);
  return select(where, [desc(blogArticles.publishedAt)], limit);
}

export type ArticleDetail = { article: BlogArticle; blog: Blog };

export async function getArticle(id: string): Promise<ArticleDetail | null> {
  const rows = await db
    .select({ article: blogArticles, blog: blogs })
    .from(blogArticles)
    .innerJoin(blogs, eq(blogs.id, blogArticles.blogId))
    .where(eq(blogArticles.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function setArticleRead(id: string, read: boolean): Promise<void> {
  await db
    .update(blogArticles)
    .set({ readAt: read ? nowIso() : null })
    .where(eq(blogArticles.id, id));
}

/** Into the queue, at its end, or out of it. */
export async function setArticleQueued(id: string, queued: boolean): Promise<void> {
  await db
    .update(blogArticles)
    .set({ savedAt: queued ? nowIso() : null })
    .where(eq(blogArticles.id, id));
}

export async function setArticleFavorite(id: string, favorite: boolean): Promise<void> {
  await db
    .update(blogArticles)
    .set({ favoritedAt: favorite ? nowIso() : null })
    .where(eq(blogArticles.id, id));
}

/**
 * Finished, as a book is: it leaves Continue Reading and the queue, and
 * counts as read. Unfinishing puts it back where its progress says, but not
 * back in the queue, as a book's does not.
 */
export async function setArticleFinished(id: string, finished: boolean): Promise<void> {
  const at = nowIso();
  await db
    .update(blogArticles)
    .set(
      finished
        ? { finishedAt: at, savedAt: null, readAt: sql`coalesce(${blogArticles.readAt}, ${at})` }
        : { finishedAt: null },
    )
    .where(eq(blogArticles.id, id));
}

/** The post whose reader copy is `bookId`, as the player's star needs it; null when there is none. */
export async function articleOfBook(bookId: string): Promise<{ id: string; favorite: boolean } | null> {
  const row = await db
    .select({ id: blogArticles.id, favoritedAt: blogArticles.favoritedAt })
    .from(blogArticles)
    .where(eq(blogArticles.bookId, bookId))
    .get();
  return row ? { id: row.id, favorite: row.favoritedAt !== null } : null;
}

/**
 * The post opened in the reader as `bookId` was read to its end: finished, as
 * `setArticleFinished` would make it. Only one not finished already, so the
 * day it was finished stays the first one. Answers whether anything changed.
 */
export async function finishArticleOfBook(bookId: string): Promise<boolean> {
  const at = nowIso();
  const changed = await db
    .update(blogArticles)
    .set({ finishedAt: at, savedAt: null, readAt: sql`coalesce(${blogArticles.readAt}, ${at})` })
    .where(and(eq(blogArticles.bookId, bookId), isNull(blogArticles.finishedAt)))
    .returning({ id: blogArticles.id });
  return changed.length > 0;
}

/** Everything in one blog read, or every followed blog's when no blog is named. */
export async function markAllRead(blogId?: string): Promise<void> {
  const unread = isNull(blogArticles.readAt);
  const scope = blogId
    ? eq(blogArticles.blogId, blogId)
    : sql`${blogArticles.blogId} in (select ${blogs.id} from ${blogs} where ${blogs.state} = 'subscribed')`;
  await db.update(blogArticles).set({ readAt: nowIso() }).where(and(unread, scope));
}
