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
import { insertHighlight, moveHighlights } from '@/services/highlights';
import { listChapters } from '@/services/podcasts/episodes';
import { playTranscriptMoment } from '@/services/podcasts/transcript/play-moment';
import { episodeHighlightLocator, highlightSeconds, placeOfWords, segmentWords, type EpisodeHighlightPlace } from '@/services/podcasts/transcript/highlight-locator';
import { ensureEpisodeBook } from '@/services/podcasts/transcript/store';

export type EpisodeHighlight = typeof highlights.$inferSelect;

/** An episode's highlights, newest first, as rows: what the reader's highlight list and menu take. Empty when it has no transcript book. */
export function listEpisodeHighlights(episodeId: string): EpisodeHighlight[] {
  return db
    .select({ highlight: highlights })
    .from(highlights)
    .innerJoin(podcastEpisodes, eq(podcastEpisodes.transcriptBookId, highlights.bookId))
    .where(eq(podcastEpisodes.id, episodeId))
    .orderBy(desc(highlights.createdAt))
    .all()
    .map((row) => row.highlight);
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
  // Kept on the transcript's clock, heard on the copy's.
  await playTranscriptMoment(episodeId, seconds);
  return true;
}

/**
 * The episode's highlights moved onto a transcript made again. Its blocks are
 * cut and timed afresh (and, from another copy of the episode, by another
 * clock), so each highlight is found again by its words and given its new
 * block and moment. One whose words the new transcript lacks is left as it
 * was: still listed, still playable from its old moment.
 */
export async function reanchorEpisodeHighlights(episodeId: string, doc: TranscriptDoc): Promise<void> {
  const kept = listEpisodeHighlights(episodeId);
  if (kept.length === 0) return;
  const chapters = (await listChapters(episodeId)).map((chapter) => ({ startSec: chapter.startSec, title: chapter.title }));
  const words = segmentWords(doc);
  const moves = kept.flatMap((highlight) => {
    const place = placeOfWords(doc, words, highlight.text, highlightSeconds(highlight.locator));
    if (!place) return [];
    const { locator, chapter } = episodeHighlightLocator(doc, chapters, { ...place, text: highlight.text, ...oldSurroundings(highlight.locator) });
    return [{ id: highlight.id, locator, chapter }];
  });
  moveHighlights(moves);
}

/** The words either side a highlight was kept with, carried to its new place. */
function oldSurroundings(locator: string | null): { before?: string; after?: string } {
  try {
    const text = (JSON.parse(locator ?? '{}') as { text?: { before?: string; after?: string } }).text;
    return { before: text?.before, after: text?.after };
  } catch {
    return {};
  }
}
