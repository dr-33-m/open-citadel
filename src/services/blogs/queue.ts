/**
 * The blogs' queue: posts kept to read later, in an order of the reader's
 * own. `savedAt` says a post is queued and since when; `queuePosition` says
 * where, 0 first, the way Up Next keeps its episodes.
 */
import { asc, eq, isNotNull, max } from 'drizzle-orm';

import { db } from '@/db/client';
import { blogArticles } from '@/db/schema';
import { nowIso } from '@/services/rows';

async function queueIds(): Promise<string[]> {
  const rows = await db
    .select({ id: blogArticles.id })
    .from(blogArticles)
    .where(isNotNull(blogArticles.savedAt))
    .orderBy(asc(blogArticles.queuePosition), asc(blogArticles.savedAt));
  return rows.map((r) => r.id);
}

/** Into the queue, at its end, or out of it. */
export async function setArticleQueued(id: string, queued: boolean): Promise<void> {
  if (!queued) {
    await db.update(blogArticles).set({ savedAt: null, queuePosition: null }).where(eq(blogArticles.id, id));
    return;
  }
  const last = await db
    .select({ position: max(blogArticles.queuePosition) })
    .from(blogArticles)
    .where(isNotNull(blogArticles.savedAt))
    .get();
  await db
    .update(blogArticles)
    .set({ savedAt: nowIso(), queuePosition: (last?.position ?? -1) + 1 })
    .where(eq(blogArticles.id, id));
}

/** A queued post to a new place, the rest closing up around it. */
export async function moveArticleInQueue(id: string, toIndex: number): Promise<void> {
  const ordered = (await queueIds()).filter((q) => q !== id);
  ordered.splice(Math.max(0, Math.min(toIndex, ordered.length)), 0, id);
  db.transaction((tx) => {
    ordered.forEach((articleId, index) => {
      tx.update(blogArticles).set({ queuePosition: index }).where(eq(blogArticles.id, articleId)).run();
    });
  });
}
