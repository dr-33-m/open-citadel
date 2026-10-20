/**
 * Highlights kept from an episode's transcript. They are ordinary rows in
 * `highlights`, on the episode's book (see `store.ts`), so the Timeline,
 * Compass, Samwell and the reader read them as they read a book's; what is
 * an episode's own is the moment each plays from (`highlight-locator.ts`).
 */
import { desc, eq } from 'drizzle-orm';
import type { TranscriptDoc } from 'samwell-shared';

import { db } from '@/db/client';
import { highlights, podcastEpisodes } from '@/db/schema';
import { insertHighlight } from '@/services/highlights';
import { listChapters } from '@/services/podcasts/episodes';
import { playEpisodeFrom } from '@/services/podcasts/player';
import { episodeHighlightLocator, highlightSeconds, type EpisodeHighlightPlace } from '@/services/podcasts/transcript/highlight-locator';
import { ensureEpisodeBook } from '@/services/podcasts/transcript/store';

export type EpisodeHighlight = {
  id: string;
  text: string;
  /** Seconds into the episode, or null for one made in the reader. */
  seconds: number | null;
  color: string;
  createdAt: string;
};

/** An episode's highlights, newest first. Empty when it has no transcript book. */
export function listEpisodeHighlights(episodeId: string): EpisodeHighlight[] {
  return db
    .select({ id: highlights.id, text: highlights.text, locator: highlights.locator, color: highlights.color, createdAt: highlights.createdAt })
    .from(highlights)
    .innerJoin(podcastEpisodes, eq(podcastEpisodes.transcriptBookId, highlights.bookId))
    .where(eq(podcastEpisodes.id, episodeId))
    .orderBy(desc(highlights.createdAt))
    .all()
    .map((row) => ({
      id: row.id,
      text: row.text,
      seconds: highlightSeconds(row.locator),
      color: row.color ?? '',
      createdAt: row.createdAt,
    }));
}

/** Keeps a line of an episode's transcript as a highlight. Null when the episode's book cannot be made. */
export async function addEpisodeHighlight(episodeId: string, doc: TranscriptDoc, place: EpisodeHighlightPlace): Promise<string | null> {
  const bookId = await ensureEpisodeBook(episodeId);
  if (!bookId) return null;
  const chapters = (await listChapters(episodeId)).map((chapter) => ({ startSec: chapter.startSec, title: chapter.title }));
  const { locator, chapter } = episodeHighlightLocator(doc, chapters, place);
  return insertHighlight({
    bookId,
    text: place.text,
    locator,
    chapter,
    context: { before: place.before, after: place.after },
  });
}

/** The episode a transcript book was made from, or null for any other book. */
export function episodeOfBook(bookId: string): string | null {
  return (
    db.select({ id: podcastEpisodes.id }).from(podcastEpisodes).where(eq(podcastEpisodes.transcriptBookId, bookId)).get()?.id ?? null
  );
}

/**
 * Plays a highlight from its moment, when it is an episode's and carries one.
 * False when it is not, so the caller can open it as a book's instead.
 */
export async function playHighlight(bookId: string, locator: string | null): Promise<boolean> {
  const seconds = highlightSeconds(locator);
  const episodeId = seconds === null ? null : episodeOfBook(bookId);
  if (episodeId === null || seconds === null) return false;
  await playEpisodeFrom(episodeId, seconds);
  return true;
}
