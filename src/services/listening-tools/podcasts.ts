import { and, asc, desc, eq, gte, isNotNull, like, ne, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { podcastChapters, podcastEpisodes, podcastListeningDays, podcasts } from '@/db/schema';
import type { EpisodeSummary, ListeningTotals, ShowSummary } from '@/services/listening-tools/podcast-format';
import { showNotesToText } from '@/services/podcasts/show-notes';
import { addDaysYmd, localDayString } from '@/utils/day';
import { filterTerms, isEmptyQuery, parseSearchQuery, rankByMatch } from '@/utils/search-terms';
import { SHOW_NAME_SQL } from '@/services/podcasts/show-name';

/** The name a show is drawn with: the reader's own for it, when they gave one. */
const showTitle = SHOW_NAME_SQL;
const count = (condition: SQL) => sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`;

/** Episodes returned at most, and fetched for the ranking to choose from when there are words to rank by. */
const EPISODES_SHOWN = 40;
const EPISODE_POOL = 400;

/** Every show they follow (or every show kept), each with what they have done with its episodes. */
export function listShows(query: string | undefined, includeUnfollowed: boolean): ShowSummary[] {
  const rows = db
    .select({
      id: podcasts.id,
      title: showTitle,
      author: podcasts.author,
      state: podcasts.state,
      episodes: sql<number>`count(${podcastEpisodes.id})`,
      played: count(sql`${podcastEpisodes.playState} = 'played'`),
      inProgress: count(sql`${podcastEpisodes.playState} != 'played' and ${podcastEpisodes.positionSec} > 0`),
      fresh: count(sql`${podcastEpisodes.playState} = 'new'`),
      favorites: count(sql`${podcastEpisodes.isFavorite} = 1`),
      upNext: count(sql`${podcastEpisodes.queuePosition} is not null`),
      downloaded: count(sql`${podcastEpisodes.downloadStatus} = 'downloaded'`),
      secondsListened: sql<number>`coalesce(sum(${podcastEpisodes.playedDurationSec}), 0)`,
      lastPlayedAt: sql<string | null>`max(${podcastEpisodes.lastPlayedAt})`,
    })
    .from(podcasts)
    .leftJoin(podcastEpisodes, eq(podcastEpisodes.podcastId, podcasts.id))
    .where(includeUnfollowed ? undefined : eq(podcasts.state, 'subscribed'))
    .groupBy(podcasts.id)
    .all()
    .map(({ state, ...row }) => ({ ...row, following: state === 'subscribed' }))
    // Most recently listened first, then never-listened by name.
    .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || a.title.localeCompare(b.title));

  const parsed = parseSearchQuery(query ?? '');
  return isEmptyQuery(parsed) ? rows : rankByMatch(rows, parsed, (show) => `${show.title} ${show.author ?? ''}`);
}

/** How much they have listened lately, from the per-day totals the player keeps. */
export function listeningTotals(): ListeningTotals {
  const today = localDayString();
  const since = (days: number) =>
    db
      .select({ seconds: sql<number>`coalesce(sum(${podcastListeningDays.seconds}), 0)` })
      .from(podcastListeningDays)
      .where(gte(podcastListeningDays.day, addDaysYmd(today, -(days - 1))))
      .get()?.seconds ?? 0;
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const finished =
    db.select({ n: sql<number>`count(*)` }).from(podcastEpisodes).where(gte(podcastEpisodes.completedAt, monthAgo)).get()?.n ?? 0;
  const upNext =
    db.select({ n: sql<number>`count(*)` }).from(podcastEpisodes).where(isNotNull(podcastEpisodes.queuePosition)).get()?.n ?? 0;
  return { secondsLast7Days: since(7), secondsLast30Days: since(30), finishedLast30Days: finished, upNext };
}

export interface EpisodeSearch {
  query?: string;
  show?: string;
  status?: 'listened' | 'in_progress' | 'unplayed' | 'new';
  favorites?: boolean;
  upNext?: boolean;
  downloaded?: boolean;
}

const episodeColumns = {
  id: podcastEpisodes.id,
  show: showTitle,
  title: podcastEpisodes.title,
  publishedAt: podcastEpisodes.pubDate,
  durationSec: podcastEpisodes.durationSec,
  playState: podcastEpisodes.playState,
  positionSec: podcastEpisodes.positionSec,
  secondsListened: podcastEpisodes.playedDurationSec,
  lastPlayedAt: podcastEpisodes.lastPlayedAt,
  completedAt: podcastEpisodes.completedAt,
  isFavorite: podcastEpisodes.isFavorite,
  upNextPosition: podcastEpisodes.queuePosition,
  downloadStatus: podcastEpisodes.downloadStatus,
  summary: podcastEpisodes.summary,
};

type EpisodeRow = { isFavorite: number; downloadStatus: string } & Omit<EpisodeSummary, 'favorite' | 'downloaded'>;

const toSummary = ({ isFavorite, downloadStatus, ...row }: EpisodeRow): EpisodeSummary => ({
  ...row,
  favorite: isFavorite === 1,
  downloaded: downloadStatus === 'downloaded',
});

/**
 * Each queued episode's place in Up Next, from 1. The stored positions are an
 * order, not places: they start at 0 and keep gaps where episodes left.
 */
function upNextPlaces(): Map<string, number> {
  const queued = db
    .select({ id: podcastEpisodes.id })
    .from(podcastEpisodes)
    .where(isNotNull(podcastEpisodes.queuePosition))
    .orderBy(asc(podcastEpisodes.queuePosition))
    .all();
  return new Map(queued.map((row, i) => [row.id, i + 1]));
}

const withUpNextPlace = (places: Map<string, number>) => (episode: EpisodeSummary): EpisodeSummary => ({
  ...episode,
  upNextPosition: places.get(episode.id) ?? null,
});

const STATUS: Record<NonNullable<EpisodeSearch['status']>, SQL | undefined> = {
  listened: eq(podcastEpisodes.playState, 'played'),
  in_progress: sql`${podcastEpisodes.playState} != 'played' and ${podcastEpisodes.positionSec} > 0`,
  unplayed: sql`${podcastEpisodes.playState} != 'played' and ${podcastEpisodes.positionSec} = 0`,
  new: eq(podcastEpisodes.playState, 'new'),
};

/**
 * Episodes by words, show and what was done with them. The order says what
 * the filter is for: Up Next in playing order, listened by when they were
 * finished (the history), anything else by when it was last listened to and
 * then by date out. With words, the best matches first.
 */
export function searchEpisodes(search: EpisodeSearch): { episodes: EpisodeSummary[]; total: number } {
  // A show only previewed is not theirs, unless they listened to some of it.
  const conditions: (SQL | undefined)[] = [or(ne(podcasts.state, 'preview'), isNotNull(podcastEpisodes.lastPlayedAt))];
  const parsed = parseSearchQuery(search.query ?? '');
  const terms = filterTerms(parsed);
  if (terms.length > 0) {
    conditions.push(
      or(
        ...terms.flatMap((term) => [
          like(podcastEpisodes.title, `%${term}%`),
          like(podcastEpisodes.summary, `%${term}%`),
          like(podcasts.title, `%${term}%`),
          like(podcasts.customTitle, `%${term}%`),
        ]),
      ),
    );
  }
  const showWords = (search.show ?? '').trim().split(/\s+/).filter(Boolean);
  for (const word of showWords) conditions.push(or(like(podcasts.title, `%${word}%`), like(podcasts.customTitle, `%${word}%`)));
  if (search.status) conditions.push(STATUS[search.status]);
  if (search.favorites) conditions.push(eq(podcastEpisodes.isFavorite, 1));
  if (search.upNext) conditions.push(isNotNull(podcastEpisodes.queuePosition));
  if (search.downloaded) conditions.push(eq(podcastEpisodes.downloadStatus, 'downloaded'));

  const order = search.upNext
    ? [asc(podcastEpisodes.queuePosition)]
    : search.status === 'listened'
      ? [desc(podcastEpisodes.completedAt), desc(podcastEpisodes.lastPlayedAt)]
      : [desc(sql`coalesce(${podcastEpisodes.lastPlayedAt}, '')`), desc(podcastEpisodes.pubDate)];

  const where = and(...conditions);
  const total =
    db
      .select({ n: sql<number>`count(*)` })
      .from(podcastEpisodes)
      .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
      .where(where)
      .get()?.n ?? 0;
  const rows = db
    .select(episodeColumns)
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(where)
    .orderBy(...order)
    .limit(terms.length > 0 ? EPISODE_POOL : EPISODES_SHOWN)
    .all()
    .map(toSummary)
    .map(withUpNextPlace(upNextPlaces()));

  const ranked = terms.length > 0 ? rankByMatch(rows, parsed, (e) => `${e.title} ${e.show} ${e.summary ?? ''}`) : rows;
  // Ranked from a pool: when the pool held every row, what matched is the count; otherwise the database's is.
  const matched = terms.length > 0 && rows.length < EPISODE_POOL ? ranked.length : total;
  return { episodes: ranked.slice(0, EPISODES_SHOWN), total: matched };
}

/** One episode with its show notes as text, its link and its chapters. Null when there is no such episode. */
export function readEpisode(episodeId: string) {
  const row = db
    .select({ ...episodeColumns, link: podcastEpisodes.link, description: podcastEpisodes.description })
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(eq(podcastEpisodes.id, episodeId))
    .get();
  if (!row) return null;
  const { description, link, ...rest } = row;
  const chapters = db
    .select({ startSec: podcastChapters.startSec, title: podcastChapters.title })
    .from(podcastChapters)
    .where(eq(podcastChapters.episodeId, episodeId))
    .orderBy(asc(podcastChapters.startSec))
    .all();
  const episode = withUpNextPlace(upNextPlaces())(toSummary(rest));
  return { episode: { ...episode, link, notes: showNotesToText(description) ?? rest.summary }, chapters };
}
