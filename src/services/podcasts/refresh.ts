/**
 * Refreshing every followed show, the way AntennaPod's `FeedUpdateWorker`
 * does: four feeds at a time, skipping any refreshed within the interval
 * unless the listener asked (a pull), and one failing feed never stopping the
 * rest. Afterwards: newly published episodes are downloaded where that is
 * wanted, and previews nobody followed are tidied away.
 *
 * AntennaPod runs this from a background job. There is no background job here
 * yet, so it runs when the app comes to the front and when Podcasts is opened,
 * whenever the interval has passed — which is when the listener would see the
 * result anyway.
 */
import { and, eq } from "drizzle-orm";

import { startTimer, track } from "@/lib/observe";
import { db } from "@/db/client";
import { podcasts } from "@/db/schema";
import { autoDownload } from "@/services/podcasts/downloads";
import { refreshShow } from "@/services/podcasts/feed-sync";
import type { Podcast } from "@/services/podcasts/records";
import { pruneStalePreviews } from "@/services/podcasts/shows";
import { podcastPrefs } from "@/stores/podcast-prefs";
import { invalidatePodcastLibrary } from "@/query-manager/podcasts/invalidate";

const CONCURRENCY = 4;

export type RefreshSummary = { refreshed: number; fresh: number; failed: number };

let inFlight: Promise<RefreshSummary> | null = null;

function isDue(show: Podcast, intervalMs: number): boolean {
  if (!show.lastRefreshAt) return true;
  return Date.now() - Date.parse(show.lastRefreshAt) >= intervalMs;
}

async function run(force: boolean): Promise<RefreshSummary> {
  const intervalMs = podcastPrefs().refreshIntervalHours * 3600 * 1000;
  const shows = (
    await db
      .select()
      .from(podcasts)
      .where(and(eq(podcasts.state, "subscribed"), eq(podcasts.keepUpdated, 1)))
  ).filter((s) => force || isDue(s, intervalMs));

  const summary: RefreshSummary = { refreshed: 0, fresh: 0, failed: 0 };
  if (shows.length === 0) return summary;
  const elapsed = startTimer();

  const freshIds: string[] = [];
  const pending = [...shows];
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
        while (pending.length > 0) {
          const show = pending.shift()!;
          const outcome = await refreshShow(show, force);
          summary.refreshed += 1;
          if (outcome.error) summary.failed += 1;
          freshIds.push(...outcome.freshIds);
        }
      }),
    );
    summary.fresh = freshIds.length;
    await autoDownload(freshIds);
    await pruneStalePreviews();
  } finally {
    invalidatePodcastLibrary();
  }
  track({ name: 'feeds.refresh', attributes: { kind: 'podcasts', feeds: summary.refreshed, failed: summary.failed, ms: elapsed() } });
  return summary;
}

/**
 * Refreshes followed shows. `force` refreshes all of them now (a pull);
 * without it only those past the refresh interval are fetched. Concurrent
 * calls share the one run rather than fetching every feed twice.
 */
export function refreshAllShows(force = false): Promise<RefreshSummary> {
  if (!inFlight) {
    inFlight = run(force).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
