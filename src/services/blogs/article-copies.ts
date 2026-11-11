/**
 * How long a post's reader copy stays on the phone.
 *
 * A copy is a reading tool, not an archive. It stays while the reader keeps
 * it on purpose, and otherwise goes a month after it was last read:
 *
 * - Kept: queued, a favorite, or holding the reader's own work (a highlight,
 *   a note, a chat with Samwell), which lives on the copy and would go with
 *   it. These stay through an unfollow too.
 * - Let go: a post only opened, thirty days after it was last read; at once
 *   on an unfollow; and at once when its publisher has since asked that its
 *   pages not be fetched (`PublisherPermissions.wholePosts`) and this copy
 *   came from the page.
 *
 * The post itself stays in its blog's list, so opening it again makes the
 * copy afresh. Removing a copy by hand ("Remove Saved Copy") goes through
 * here too, highlights and all, since the reader asked.
 */
import { and, eq, isNotNull, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { blogArticles, books, chatSessions, highlights, notes, readingProgress } from '@/db/schema';
import { deleteBookWithFile } from '@/services/book-delete';
import { permissionsFor } from '@/services/publishers';
import { yieldToUi } from '@/services/rows';
import { selectBook, usePlayer } from '@/stores/player';
import { useReaderStore } from '@/stores/reader';

/** How long a copy only opened is kept after it was last read. */
export const COPY_TTL_MS = 30 * 24 * 3600 * 1000;

/** A copy the reader kept on purpose, or did their own work on. */
// Uncorrelated `in` lists: SQLite builds each once, rather than scanning
// highlights and notes (no index on their book) for every copy.
const keptCopy: SQL = sql`(${blogArticles.savedAt} is not null
  or ${blogArticles.favoritedAt} is not null
  or ${blogArticles.bookId} in (select ${highlights.bookId} from ${highlights})
  or ${blogArticles.bookId} in (select ${notes.bookId} from ${notes})
  or ${blogArticles.bookId} in (select ${chatSessions.bookId} from ${chatSessions} where ${chatSessions.bookId} is not null))`;

const lastRead = sql<string>`coalesce(
  (select max(${readingProgress.updatedAt}) from ${readingProgress} where ${readingProgress.bookId} = ${blogArticles.bookId}),
  (select ${books.addedAt} from ${books} where ${books.id} = ${blogArticles.bookId}),
  ''
)`;

/** Copies open now, in the reader or the player, which nothing here may pull from under them. */
function inUse(): Set<string> {
  const open = [useReaderStore.getState().currentBook?.id, selectBook(usePlayer.getState())?.bookId];
  return new Set(open.filter((id): id is string => !!id));
}

async function letGo(rows: { id: string; bookId: string | null }[]): Promise<number> {
  for (const row of rows) {
    if (row.bookId) await deleteBookWithFile(row.bookId);
    db.update(blogArticles).set({ bookId: null, copyWhole: null }).where(eq(blogArticles.id, row.id)).run();
    // The first sweep after an update can have dozens to let go: one a frame.
    if (rows.length > 1) await yieldToUi();
  }
  return rows.length;
}

/** Removes one post's copy, whatever is on it. The post stays listed. False when it is open in the reader or the player. */
export async function removeArticleCopy(articleId: string): Promise<boolean> {
  const rows = db.select({ id: blogArticles.id, bookId: blogArticles.bookId }).from(blogArticles).where(eq(blogArticles.id, articleId)).all();
  const open = inUse();
  if (rows.some((row) => row.bookId && open.has(row.bookId))) return false;
  await letGo(rows);
  return true;
}

/** Whether a post's copy holds the reader's own work, which removing it would take too. */
export function copyHoldsWork(bookId: string): boolean {
  const count = (table: typeof highlights | typeof notes) =>
    db.select({ n: sql<number>`count(*)` }).from(table).where(eq(table.bookId, bookId)).get()?.n ?? 0;
  return count(highlights) + count(notes) > 0;
}

/** Lets go of a blog's copies that were not kept, on unfollowing it. */
export async function releaseBlogCopies(blogId: string): Promise<number> {
  const rows = db
    .select({ id: blogArticles.id, bookId: blogArticles.bookId })
    .from(blogArticles)
    .where(and(eq(blogArticles.blogId, blogId), isNotNull(blogArticles.bookId), sql`not ${keptCopy}`))
    .all();
  const open = inUse();
  return letGo(rows.filter((row) => !open.has(row.bookId!)));
}

/** The sweep, run with each refresh: copies past their month, and page copies a publisher has since said no to. */
export async function pruneArticleCopies(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - COPY_TTL_MS).toISOString();
  // A whole copy of a post whose feed carries only the opening came from its page.
  const fromPage = sql<number>`(${blogArticles.feedExcerpt} = 1 and coalesce(${blogArticles.copyWhole}, 1) = 1)`;
  const loose = db
    .select({ id: blogArticles.id, bookId: blogArticles.bookId, link: blogArticles.link, lastRead, fromPage })
    .from(blogArticles)
    .where(and(isNotNull(blogArticles.bookId), sql`not ${keptCopy}`))
    .all();
  const open = inUse();
  const due = loose.filter(
    (row) => !open.has(row.bookId!) && (row.lastRead < cutoff || (row.fromPage === 1 && !permissionsFor(row.link).wholePosts)),
  );
  return letGo(due);
}
