/**
 * Reading episodes: the shelves, a show's list, one episode and its chapters.
 * Changing them is `episode-state` (one episode) and `queue` (Up Next).
 */
import { and, asc, desc, eq, getTableColumns, isNotNull, ne, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { podcastChapters, podcastEpisodes, podcasts } from "@/db/schema";
import { type Episode, type EpisodeItem, type Podcast } from "@/services/podcasts/records";
import { SHOW_NAME_SQL } from "@/services/podcasts/show-name";

const { description: _notes, ...listColumns } = getTableColumns(podcastEpisodes);

/** What a list row selects: no show notes, plus the show's name and artwork. */
const ITEM_COLUMNS = {
  ...listColumns,
  showTitle: SHOW_NAME_SQL,
  showImageUrl: podcasts.imageUrl,
};

/** The episode lists the Podcasts page draws as shelves, each with a "View all". */
export type EpisodeShelf =
  | "continue"
  | "queue"
  | "inbox"
  | "favorites"
  | "downloads"
  | "history"
  | "latest";

const SUBSCRIBED = eq(podcasts.state, "subscribed");

const SHELVES: Record<EpisodeShelf, { where: SQL | undefined; order: SQL[] }> = {
  continue: {
    where: and(sql`${podcastEpisodes.positionSec} > 0`, ne(podcastEpisodes.playState, "played")),
    order: [desc(podcastEpisodes.lastPlayedAt)],
  },
  queue: {
    where: isNotNull(podcastEpisodes.queuePosition),
    order: [asc(podcastEpisodes.queuePosition)],
  },
  inbox: {
    where: and(eq(podcastEpisodes.playState, "new"), SUBSCRIBED),
    order: [desc(podcastEpisodes.pubDate)],
  },
  favorites: {
    where: eq(podcastEpisodes.isFavorite, 1),
    order: [desc(podcastEpisodes.pubDate)],
  },
  downloads: {
    where: ne(podcastEpisodes.downloadStatus, "none"),
    order: [desc(sql`coalesce(${podcastEpisodes.downloadedAt}, ${podcastEpisodes.updatedAt})`)],
  },
  history: {
    where: isNotNull(podcastEpisodes.lastPlayedAt),
    order: [desc(podcastEpisodes.lastPlayedAt)],
  },
  latest: {
    where: SUBSCRIBED,
    order: [desc(podcastEpisodes.pubDate)],
  },
};

export async function listShelf(shelf: EpisodeShelf, limit?: number): Promise<EpisodeItem[]> {
  const { where, order } = SHELVES[shelf];
  const query = db
    .select(ITEM_COLUMNS)
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(where)
    .orderBy(...order);
  return limit ? query.limit(limit) : query;
}

export type ShowEpisodeFilter = "all" | "unplayed" | "downloaded" | "favorites";

export async function listShowEpisodes(
  podcastId: string,
  sort: "newest" | "oldest",
  filter: ShowEpisodeFilter,
): Promise<EpisodeItem[]> {
  const conditions: (SQL | undefined)[] = [eq(podcastEpisodes.podcastId, podcastId)];
  if (filter === "unplayed") conditions.push(ne(podcastEpisodes.playState, "played"));
  if (filter === "downloaded") conditions.push(eq(podcastEpisodes.downloadStatus, "downloaded"));
  if (filter === "favorites") conditions.push(eq(podcastEpisodes.isFavorite, 1));
  return db
    .select(ITEM_COLUMNS)
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(and(...conditions))
    .orderBy(sort === "newest" ? desc(podcastEpisodes.pubDate) : asc(podcastEpisodes.pubDate));
}

export type EpisodeDetail = { episode: Episode; show: Podcast };

export async function getEpisode(id: string): Promise<EpisodeDetail | null> {
  const rows = await db
    .select({ episode: podcastEpisodes, show: podcasts })
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(eq(podcastEpisodes.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEpisodeItem(id: string): Promise<EpisodeItem | null> {
  const rows = await db
    .select(ITEM_COLUMNS)
    .from(podcastEpisodes)
    .innerJoin(podcasts, eq(podcasts.id, podcastEpisodes.podcastId))
    .where(eq(podcastEpisodes.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listChapters(episodeId: string) {
  return db
    .select()
    .from(podcastChapters)
    .where(eq(podcastChapters.episodeId, episodeId))
    .orderBy(asc(podcastChapters.startSec));
}
