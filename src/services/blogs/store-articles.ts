/**
 * Writing a feed's posts into the library.
 *
 * A post is known by its blog and its link, so a refresh adds what is new and
 * brings the rest up to date (writers fix typos and retitle posts) without
 * touching whether it was read, queued or opened. Posts past the newest
 * `KEEP_PER_BLOG` are let go unless they were kept on purpose: a blog that
 * posts daily would otherwise grow without end. Feeds carry their newest
 * few dozen posts at most, so a post let go never comes back on a refresh,
 * which is what Read You keeps a table of archived links to prevent.
 */
import { and, eq, not, notInArray, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { blogArticles } from '@/db/schema';
import { keptOnPurpose } from '@/services/blogs/articles';
import type { ParsedArticle } from '@/services/blogs/feed-parser';
import { KEEP_PER_BLOG } from '@/services/blogs/records';
import { chunk, newId, nowIso, yieldToUi } from '@/services/rows';

/** Rows per INSERT: sixteen columns a row, well under SQLite's 999 bound values. */
const INSERT_CHUNK = 40;

/** Stores a feed's posts for a blog. Returns how many were new. */
export async function storeArticles(blogId: string, articles: ParsedArticle[]): Promise<number> {
  if (articles.length === 0) return 0;
  const known = new Set(
    (await db.select({ link: blogArticles.link }).from(blogArticles).where(eq(blogArticles.blogId, blogId))).map(
      (r) => r.link,
    ),
  );
  const fetchedAt = nowIso();
  const rows = articles.map((a) => ({
    id: newId(),
    blogId,
    guid: a.guid,
    link: a.link,
    title: a.title,
    author: a.author,
    summary: a.summary,
    contentHtml: a.contentHtml,
    feedExcerpt: a.excerpt,
    imageUrl: a.imageUrl,
    publishedAt: a.publishedAt,
    fetchedAt,
  }));

  for (const part of chunk(rows, INSERT_CHUNK)) {
    await db
      .insert(blogArticles)
      .values(part)
      .onConflictDoUpdate({
        target: [blogArticles.blogId, blogArticles.link],
        set: {
          title: sql`excluded.title`,
          author: sql`excluded.author`,
          summary: sql`excluded.summary`,
          contentHtml: sql`excluded.content_html`,
          feedExcerpt: sql`excluded.feed_excerpt`,
          imageUrl: sql`excluded.image_url`,
        },
      });
    await yieldToUi();
  }
  await trimBlog(blogId);
  return rows.filter((r) => !known.has(r.link)).length;
}

/** Lets go of a blog's oldest posts past the ones worth keeping. */
async function trimBlog(blogId: string): Promise<void> {
  const keep = db
    .select({ id: blogArticles.id })
    .from(blogArticles)
    .where(eq(blogArticles.blogId, blogId))
    .orderBy(sql`${blogArticles.publishedAt} desc`)
    .limit(KEEP_PER_BLOG);
  await db
    .delete(blogArticles)
    .where(
      and(
        eq(blogArticles.blogId, blogId),
        not(keptOnPurpose),
        notInArray(blogArticles.id, keep),
      ),
    );
}
