/**
 * Refreshing followed blogs: four at a time, each with a conditional GET so a
 * blog with nothing new costs a 304 and no parsing, skipping any refreshed
 * within the interval unless the reader asked (a pull). One failing blog
 * never stops the rest; its reason is kept for its page.
 *
 * Like podcasts, there is no background job: this runs when the Blogs side
 * opens and on a pull, which is when the result would be seen anyway.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { blogs } from '@/db/schema';
import { parseBlogFeed } from '@/services/blogs/feed-parser';
import type { Blog } from '@/services/blogs/records';
import { storeArticles } from '@/services/blogs/store-articles';
import { pruneArticleCopies } from '@/services/blogs/article-copies';
import { pruneStalePreviews } from '@/services/blogs/blogs';
import { fetchFeed } from '@/services/feeds/fetch';
import { refreshPublisherRules } from '@/services/publishers';
import { nowIso } from '@/services/rows';

const CONCURRENCY = 4;
const INTERVAL_MS = 2 * 3600 * 1000;

export type BlogRefreshSummary = { refreshed: number; fresh: number; failed: number };

/** Not refreshed within the interval. */
export function isRefreshDue(blog: Blog): boolean {
  return !blog.lastRefreshAt || Date.now() - Date.parse(blog.lastRefreshAt) >= INTERVAL_MS;
}

/** One blog. Returns how many posts were new, or the reason it failed. */
export async function refreshBlog(blog: Blog, force = false): Promise<{ fresh: number; error: string | null }> {
  try {
    // A blog whose last fetch failed is asked afresh, not with a validator from before the failure.
    const validator = force || blog.lastRefreshError ? null : blog.httpValidator;
    const result = await fetchFeed(blog.feedUrl, validator);
    if (result.status === 'not-modified') {
      await db.update(blogs).set({ lastRefreshAt: nowIso(), lastRefreshError: null }).where(eq(blogs.id, blog.id));
      return { fresh: 0, error: null };
    }
    const parsed = parseBlogFeed(result.xml, result.url);
    const fresh = await storeArticles(blog.id, parsed.articles);
    await db
      .update(blogs)
      .set({
        title: parsed.title,
        siteUrl: parsed.siteUrl ?? blog.siteUrl,
        description: parsed.description ?? blog.description,
        // Kept once set: it may be the directory's icon or the site's, which a feed image should not replace.
        imageUrl: blog.imageUrl ?? parsed.imageUrl,
        language: parsed.language ?? blog.language,
        rights: parsed.rights ?? blog.rights,
        httpValidator: result.validator,
        lastRefreshAt: nowIso(),
        lastRefreshError: null,
      })
      .where(eq(blogs.id, blog.id));
    return { fresh, error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'This blog could not be refreshed.';
    await db.update(blogs).set({ lastRefreshAt: nowIso(), lastRefreshError: error }).where(eq(blogs.id, blog.id));
    return { fresh: 0, error };
  }
}

async function run(force: boolean): Promise<BlogRefreshSummary> {
  const due = (await db.select().from(blogs).where(eq(blogs.state, 'subscribed'))).filter((b) => force || isRefreshDue(b));
  const summary: BlogRefreshSummary = { refreshed: 0, fresh: 0, failed: 0 };
  const pending = [...due];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
      while (pending.length > 0) {
        const outcome = await refreshBlog(pending.shift()!, force);
        summary.refreshed += 1;
        summary.fresh += outcome.fresh;
        if (outcome.error) summary.failed += 1;
      }
    }),
  );
  await pruneStalePreviews();
  // What publishers ask first, since the sweep keeps to it.
  await refreshPublisherRules();
  await pruneArticleCopies();
  return summary;
}

let inFlight: Promise<BlogRefreshSummary> | null = null;

/**
 * Refreshes followed blogs: all of them when `force` (a pull), otherwise those
 * past the interval. Concurrent calls share one run.
 */
export function refreshAllBlogs(force = false): Promise<BlogRefreshSummary> {
  if (!inFlight) {
    inFlight = run(force).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
