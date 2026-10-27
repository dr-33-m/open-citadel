import { eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { podcastEpisodes, podcasts } from '@/db/schema';
import { duration, plural } from '@/services/listening-tools/format';
import { episodeArtwork } from '@/services/podcasts/download-paths';
import { SHOW_NAME_SQL } from '@/services/podcasts/show-name';

/** What a podcast card in the transcript draws. */
export interface PodcastCardData {
  title: string;
  subtitle: string | null;
  coverUri: string | null;
  status: string | null;
}

export type PodcastCardKind = 'show' | 'episode';

const showTitle = SHOW_NAME_SQL;

/**
 * A show or an episode Samwell named, as its card draws it: the artwork the
 * rest of the app draws it with, and where the listener is with it. Null when
 * it is no longer on the device, so the card leaves no trace.
 *
 * Synchronous, like the book card's read: the card is drawn mid-reply, and a
 * read in an effect drew nothing for a frame and then the whole card.
 */
export function readPodcastCard(kind: PodcastCardKind, id: string): PodcastCardData | null {
  return kind === 'show' ? readShow(id) : readEpisode(id);
}

function readShow(id: string): PodcastCardData | null {
  const row = db
    .select({
      title: showTitle,
      author: podcasts.author,
      imageUrl: podcasts.imageUrl,
      state: podcasts.state,
      // A join and a group, not correlated subqueries: drizzle writes a
      // column in raw SQL without its table, and `id` inside the subquery
      // was the episode's own, so every show counted nothing.
      episodes: sql<number>`count(${podcastEpisodes.id})`,
      played: sql<number>`coalesce(sum(case when ${podcastEpisodes.playState} = 'played' then 1 else 0 end), 0)`,
    })
    .from(podcasts)
    .leftJoin(podcastEpisodes, eq(podcastEpisodes.podcastId, podcasts.id))
    .where(eq(podcasts.id, id))
    .groupBy(podcasts.id)
    .get();
  if (!row) return null;
  const status =
    row.played > 0 ? `${row.played} of ${plural(row.episodes, 'episode')} played` : row.state === 'subscribed' ? 'Following' : null;
  return { title: row.title, subtitle: row.author, coverUri: row.imageUrl, status };
}

function readEpisode(id: string): PodcastCardData | null {
  const row = db
    .select({
      title: podcastEpisodes.title,
      show: showTitle,
      imageUrl: podcastEpisodes.imageUrl,
      showImageUrl: podcasts.imageUrl,
      downloadStatus: podcastEpisodes.downloadStatus,
      downloadCover: podcastEpisodes.downloadCover,
      playState: podcastEpisodes.playState,
      positionSec: podcastEpisodes.positionSec,
      durationSec: podcastEpisodes.durationSec,
      queuePosition: podcastEpisodes.queuePosition,
    })
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(eq(podcastEpisodes.id, id))
    .get();
  if (!row) return null;
  return { title: row.title, subtitle: row.show, coverUri: episodeArtwork(row), status: episodeStatus(row) };
}

/** Where the listener is with an episode, in a few words. */
function episodeStatus(row: {
  playState: string;
  positionSec: number;
  durationSec: number;
  queuePosition: number | null;
}): string | null {
  if (row.playState === 'played') return 'Played';
  if (row.positionSec > 0) {
    return row.durationSec > row.positionSec ? `${duration(row.durationSec - row.positionSec)} left` : 'Started';
  }
  if (row.queuePosition !== null) return 'In Up Next';
  return null;
}
