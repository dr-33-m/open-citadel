/**
 * Episodes with a transcript, for the composer's Podcast picker. A reading
 * of the library; nothing here fetches.
 */
import { and, desc, eq, isNotNull, ne, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { podcastEpisodes, podcasts } from '@/db/schema';
import type { TranscriptWindow } from '@/services/podcasts/transcript/windows';
import { windowStart } from '@/services/podcasts/transcript/windows';

export type TranscribedEpisode = {
  id: string;
  title: string;
  showTitle: string;
  imageUrl: string | null;
  durationSec: number;
  /** Whether it is here already, or only listed by the feed (fetched on pick). */
  ready: boolean;
  /** Its latest moment: last played, transcribed, else published. */
  latestAt: string | null;
};

/** The latest moment an episode has: when it was last played or transcribed, else when it came out. */
const LATEST = sql<string | null>`coalesce(nullif(max(coalesce(${podcastEpisodes.lastPlayedAt}, ''), coalesce(${podcastEpisodes.transcriptAt}, '')), ''), ${podcastEpisodes.pubDate})`;

export function listTranscribedEpisodes(window: TranscriptWindow, now = new Date()): TranscribedEpisode[] {
  const since = windowStart(window, now);
  const latest = LATEST;
  const rows = db
    .select({
      id: podcastEpisodes.id,
      title: podcastEpisodes.title,
      showTitle: sql<string>`coalesce(nullif(trim(${podcasts.customTitle}), ''), ${podcasts.title})`,
      imageUrl: sql<string | null>`coalesce(${podcastEpisodes.imageUrl}, ${podcasts.imageUrl})`,
      durationSec: podcastEpisodes.durationSec,
      status: podcastEpisodes.transcriptStatus,
      latestAt: latest,
    })
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(
      and(
        or(eq(podcastEpisodes.transcriptStatus, 'ready'), and(isNotNull(podcastEpisodes.transcriptUrl), ne(podcastEpisodes.transcriptUrl, ''))),
        since ? sql`${latest} >= ${since}` : undefined,
      ),
    )
    .orderBy(desc(latest))
    .limit(200)
    .all();
  return rows.map(({ status, ...row }) => ({ ...row, ready: status === 'ready' }));
}

export type EpisodeOfBook = { episodeId: string; showTitle: string; durationSec: number };

/** The episode whose transcript is this book, for a chat about it. Null for any other book. */
export function episodeForBook(bookId: string): EpisodeOfBook | null {
  return (
    db
      .select({
        episodeId: podcastEpisodes.id,
        showTitle: sql<string>`coalesce(nullif(trim(${podcasts.customTitle}), ''), ${podcasts.title})`,
        durationSec: podcastEpisodes.durationSec,
      })
      .from(podcastEpisodes)
      .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
      .where(eq(podcastEpisodes.transcriptBookId, bookId))
      .get() ?? null
  );
}
