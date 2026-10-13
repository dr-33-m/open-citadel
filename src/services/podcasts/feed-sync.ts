/**
 * Turning a fetched feed into rows: adding a show for the first time, and
 * folding a refreshed feed into one that is already stored.
 *
 * The refresh follows AntennaPod's `FeedDatabaseWriter.updateFeed`: match the
 * feed's episodes to the stored ones (see `episode-match`), update what the
 * publisher changed without touching anything the listener did, and give only
 * the genuinely new episodes the new-episode treatment — inbox, Up Next, or
 * nothing, per show or per the global setting.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { podcastChapters, podcastEpisodes, podcasts, type EpisodePlayState } from "@/db/schema";
import { enqueue } from "@/services/podcasts/queue";
import { fetchFeed, FeedFetchError } from "@/services/feeds/fetch";
import { parseFeed, type ParsedEpisode } from "@/services/podcasts/feed-parser";
import { isFreshlyPublished, planEpisodeMerge } from "@/services/podcasts/episode-match";
import {
  chunk,
  INSERT_CHUNK,
  newId,
  nowIso,
  yieldToUi,
  type NewEpisode,
  type Podcast,
} from "@/services/podcasts/records";
import { changed, presentShowColumns, publishedColumns, showColumns, type StoredForMerge } from "@/services/podcasts/feed-columns";
import { findShowByFeedUrl, getShow, subscribe } from "@/services/podcasts/shows";
import { podcastPrefs } from "@/stores/podcast-prefs";

export type RefreshOutcome = {
  podcastId: string;
  /** Episodes that were just published and landed in the inbox or Up Next. */
  freshIds: string[];
  error: string | null;
};

function newEpisodeRow(podcastId: string, episode: ParsedEpisode, playState: EpisodePlayState, now: string): NewEpisode {
  return {
    id: newId(),
    podcastId,
    ...publishedColumns(episode),
    durationSec: episode.durationSec,
    playState,
    addedAt: now,
    updatedAt: now,
  };
}

async function insertEpisodes(rows: { row: NewEpisode; parsed: ParsedEpisode }[]): Promise<void> {
  for (const batch of chunk(rows, INSERT_CHUNK)) {
    db.transaction((tx) => {
      tx.insert(podcastEpisodes).values(batch.map((b) => b.row)).run();
      const chapters = batch.flatMap((b) =>
        b.parsed.chapters.map((c) => ({
          id: newId(),
          episodeId: b.row.id!,
          startSec: c.startSec,
          title: c.title,
          link: c.link,
          imageUrl: c.imageUrl,
        })),
      );
      for (const part of chunk(chapters, 100)) tx.insert(podcastChapters).values(part).run();
    });
    await yieldToUi();
  }
}

/**
 * A show, from its feed, the first time it is seen.
 *
 * Every episode starts unplayed; following it (now, or later from its page)
 * is what puts the newest one in the inbox. A feed that is already stored is
 * returned as it is, followed if it was only being previewed.
 */
export async function addShowFromFeed(
  feedUrl: string,
  state: "subscribed" | "preview",
): Promise<Podcast> {
  const existing = await findShowByFeedUrl(feedUrl);
  if (existing) {
    if (state === "subscribed" && existing.state !== "subscribed") await subscribe(existing.id);
    return (await getShow(existing.id)) ?? existing;
  }

  const fetched = await fetchFeed(feedUrl);
  if (fetched.status !== "ok") throw new FeedFetchError("The feed sent nothing back.");
  const feed = parseFeed(fetched.xml);
  const now = nowIso();
  const id = newId();
  await db.insert(podcasts).values({
    id,
    feedUrl,
    ...showColumns(feed),
    state: "preview",
    httpValidator: fetched.validator,
    lastRefreshAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await insertEpisodes(
    feed.episodes.map((parsed) => ({ row: newEpisodeRow(id, parsed, "unplayed", now), parsed })),
  );
  if (state === "subscribed") await subscribe(id);
  return (await getShow(id))!;
}

function resolveAction(show: Podcast): "inbox" | "queue" | "nothing" {
  return show.newEpisodesAction === "global" ? podcastPrefs().newEpisodesAction : show.newEpisodesAction;
}

/**
 * Refreshes one show. Never throws: a failure is recorded on the show (and
 * shown under its name) and reported back, so one broken feed cannot stop a
 * refresh of fifty.
 */
export async function refreshShow(show: Podcast, force = false): Promise<RefreshOutcome> {
  const outcome: RefreshOutcome = { podcastId: show.id, freshIds: [], error: null };
  try {
    const fetched = await fetchFeed(show.feedUrl, force || show.lastRefreshFailed ? null : show.httpValidator);
    const now = nowIso();
    if (fetched.status === "not-modified") {
      await db
        .update(podcasts)
        .set({ lastRefreshAt: now, lastRefreshFailed: 0, lastRefreshError: null })
        .where(eq(podcasts.id, show.id));
      return outcome;
    }
    // Each step of what follows holds the JS thread on its own (parsing a
    // long-running show's feed is over a second of it), and several feeds
    // land together. Handing the thread back between the steps lets a tap in
    // between them, instead of waiting out every feed end to end.
    await yieldToUi();
    const feed = parseFeed(fetched.xml);
    await yieldToUi();

    const stored: StoredForMerge[] = await db
      .select({
        id: podcastEpisodes.id,
        guid: podcastEpisodes.guid,
        audioUrl: podcastEpisodes.audioUrl,
        title: podcastEpisodes.title,
        pubDate: podcastEpisodes.pubDate,
        durationSec: podcastEpisodes.durationSec,
        mimeType: podcastEpisodes.mimeType,
        imageUrl: podcastEpisodes.imageUrl,
        fileSize: podcastEpisodes.fileSize,
        chaptersUrl: podcastEpisodes.chaptersUrl,
        notesLength: sql<number>`coalesce(length(${podcastEpisodes.description}), 0)`.mapWith(Number),
      })
      .from(podcastEpisodes)
      .where(eq(podcastEpisodes.podcastId, show.id));
    const newestStored = stored.reduce<string | null>(
      (max, e) => (e.pubDate && (!max || e.pubDate > max) ? e.pubDate : max),
      null,
    );
    const storedById = new Map(stored.map((s) => [s.id, s]));
    await yieldToUi();
    const plan = planEpisodeMerge(stored, feed.episodes);
    await yieldToUi();

    const updates = plan.updates.filter((u) => changed(storedById.get(u.id)!, u.episode));
    for (const batch of chunk(updates, 50)) {
      db.transaction((tx) => {
        for (const { id, episode } of batch) {
          tx.update(podcastEpisodes)
            .set({
              ...publishedColumns(episode),
              ...(episode.durationSec > 0 ? { durationSec: episode.durationSec } : {}),
              updatedAt: now,
            })
            .where(eq(podcastEpisodes.id, id))
            .run();
        }
      });
      await yieldToUi();
    }

    const subscribed = show.state === "subscribed";
    const action = resolveAction(show);
    const inserts = plan.inserts.map((parsed) => {
      const fresh = subscribed && stored.length > 0 && isFreshlyPublished(parsed, newestStored);
      const playState: EpisodePlayState = fresh && action === "inbox" ? "new" : "unplayed";
      const row = newEpisodeRow(show.id, parsed, playState, now);
      if (fresh && action !== "nothing") outcome.freshIds.push(row.id!);
      return { row, parsed, queue: fresh && action === "queue" };
    });
    await insertEpisodes(inserts);
    const toQueue = inserts.filter((i) => i.queue).map((i) => i.row.id!);
    // Oldest first, so a morning's worth of new episodes plays in the order it was published.
    if (toQueue.length > 0) await enqueue(toQueue.reverse(), "last");

    await db
      .update(podcasts)
      .set({
        ...presentShowColumns(feed),
        httpValidator: fetched.validator,
        lastRefreshAt: now,
        lastRefreshFailed: 0,
        lastRefreshError: null,
        updatedAt: now,
      })
      .where(eq(podcasts.id, show.id));
  } catch (err) {
    outcome.error = err instanceof Error ? err.message : "The feed could not be refreshed.";
    await db
      .update(podcasts)
      .set({ lastRefreshAt: nowIso(), lastRefreshFailed: 1, lastRefreshError: outcome.error })
      .where(eq(podcasts.id, show.id));
  }
  return outcome;
}
