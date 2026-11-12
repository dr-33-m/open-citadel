/**
 * A book's saved place, and what moving it earns: written the same way
 * whether the book is being read in the reader or heard in the player.
 *
 * Two places save a position, the reader as pages turn and the audiobook as
 * sentences play, and both must earn the day on the Timeline by the same
 * rule (`services/reading-day`), move the Library's bar, and finish the book
 * when it is left at its end. One path, so a listened day and a read day are
 * the same day.
 */
import type { Locator } from "@dr33m/react-native-readium";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { books, readingDays, readingProgress } from "@/db/schema";
import { invalidateBlogLibrary } from "@/query-manager/blogs/invalidate";
import { finishArticleOfBook } from "@/services/blogs/articles";
import { countableProgress } from "@/services/reading-day";
import { useBooksStore } from "@/stores/books";
import { localDayString } from "@/utils/day";

type Book = typeof books.$inferSelect;

/** Accumulate the day's reading for this book. What counts as reading (and
 * what is just navigation) lives in `services/reading-day`. */
async function recordReadingDay(bookId: string, previousPct: number, nextPct: number) {
  const delta = countableProgress(previousPct, nextPct);
  if (delta === 0) return;

  const day = localDayString();
  const id = `${day}:${bookId}`;
  const now = new Date().toISOString();

  const [row] = await db.select().from(readingDays).where(eq(readingDays.id, id));
  if (row) {
    await db
      .update(readingDays)
      .set({ progressDelta: row.progressDelta + delta, updatedAt: now })
      .where(eq(readingDays.id, id));
  } else {
    await db.insert(readingDays).values({ id, day, bookId, progressDelta: delta, updatedAt: now });
  }
}

/**
 * Saves where a book is and how far through it, and earns the day for the
 * step forward. `locator` is the reader's, or a sentence's from the audiobook
 * (`features/audiobook/utils/sentence-locator`): Readium opens on either.
 */
export async function saveReadingPosition(
  bookId: string,
  locator: Locator | Record<string, unknown>,
  percentage: number,
) {
  const now = new Date().toISOString();
  const locatorJson = JSON.stringify(locator);

  const [existing] = await db
    .select()
    .from(readingProgress)
    .where(eq(readingProgress.bookId, bookId));

  if (existing) {
    await db
      .update(readingProgress)
      .set({ percentage, locator: locatorJson, updatedAt: now })
      .where(eq(readingProgress.id, existing.id));
  } else {
    await db.insert(readingProgress).values({
      id: `rp-${bookId}`,
      bookId,
      currentPage: 0,
      percentage,
      locator: locatorJson,
      updatedAt: now,
    });
  }

  /*
   * The row is written, so the Library can be told what it says.
   *
   * After the await, never before it, and pushed rather than left to be
   * discovered. The card used to query for this row itself when the Library
   * regained focus, which raced `closeBook`: that write is fired without being
   * awaited, because closing a screen cannot wait on a database, and the read
   * usually won. The bar showed the position from the previous visit and only
   * caught up on the next one, which is exactly how it was reported.
   */
  useBooksStore.getState().setBookProgress(bookId, percentage, now);

  // First-ever write for a book has no previous position to compare against,
  // so it contributes nothing — opening a book isn't reading it.
  await recordReadingDay(bookId, existing?.percentage ?? percentage, percentage);
}

/**
 * A book or a post the reader was left at the end of becomes finished: a book
 * moves to Have Read as "Mark as Finished" would move it, a post to the blogs'
 * Have Read. Nothing is said about it, since it happens on the way out and the
 * shelf it lands on is the answer. One already finished is left alone, so the
 * day it was finished stays the first one.
 *
 * It used to take the menu, which nobody thinks to open for something they
 * have just read: finished posts stayed out of Have Read, and could not be
 * found there.
 */
export async function finishRead(book: Book): Promise<void> {
  // A transcript is read alongside listening, and an episode is finished by
  // listening to it, never by reading its transcript to the end.
  if (book.kind === "episode") return;
  if (book.kind === "article") {
    if (await finishArticleOfBook(book.id)) invalidateBlogLibrary();
    return;
  }
  if (book.status !== "archived") await useBooksStore.getState().updateBookStatus(book.id, "archived");
}

