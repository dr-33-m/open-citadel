/** Up Next: its order, and adding, moving and removing episodes. */
import { asc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import { podcastEpisodes } from "@/db/schema";
import { markSeen } from "@/services/podcasts/episode-state";
import { splitAfterMove, splitQueue } from "@/services/podcasts/player/play-order";
import { nowIso } from "@/services/podcasts/records";

async function queueRows() {
  return db
    .select({ id: podcastEpisodes.id, queuePosition: podcastEpisodes.queuePosition })
    .from(podcastEpisodes)
    .where(isNotNull(podcastEpisodes.queuePosition))
    .orderBy(asc(podcastEpisodes.queuePosition));
}

/**
 * Writes Up Next back in the given order and clears anything not in it. The
 * "Play next" block counts up to -1 and the rest from 0, so the block is both
 * the front of the list and marked as what it is.
 */
async function writeQueue({ playNext, rest }: { playNext: string[]; rest: string[] }): Promise<void> {
  const now = nowIso();
  const ordered = [...playNext, ...rest];
  db.transaction((tx) => {
    tx.update(podcastEpisodes)
      .set({ queuePosition: null })
      .where(isNotNull(podcastEpisodes.queuePosition))
      .run();
    ordered.forEach((id, index) => {
      tx.update(podcastEpisodes)
        .set({ queuePosition: index - playNext.length, updatedAt: now })
        .where(eq(podcastEpisodes.id, id))
        .run();
    });
  });
}

/**
 * Adds episodes to Up Next, at the front ("play next") or the back. Anything
 * already queued moves rather than appearing twice. Queuing an episode also
 * takes it out of the inbox: deciding to listen is the decision the inbox is
 * asking for.
 */
export async function enqueue(ids: string[], where: "next" | "last"): Promise<void> {
  if (ids.length === 0) return;
  const { playNext, rest } = splitQueue((await queueRows()).filter((row) => !ids.includes(row.id)));
  await writeQueue(where === "next" ? { playNext: [...ids, ...playNext], rest } : { playNext, rest: [...rest, ...ids] });
  await markSeen(ids);
}

export async function dequeue(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(podcastEpisodes)
    .set({ queuePosition: null, updatedAt: nowIso() })
    .where(inArray(podcastEpisodes.id, ids));
}

export async function moveInQueue(id: string, toIndex: number): Promise<void> {
  await writeQueue(splitAfterMove(await queueRows(), id, toIndex));
}

export async function clearQueue(): Promise<void> {
  await writeQueue({ playNext: [], rest: [] });
}

/** The queue as ids, in order, for the player to mirror. */
export async function upNextIds(): Promise<string[]> {
  return (await queueRows()).map((row) => row.id);
}
