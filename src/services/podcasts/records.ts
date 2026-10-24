/**
 * The podcast row types, and the few helpers every podcast service shares for
 * writing them.
 */
import type { podcastEpisodes, podcasts } from "@/db/schema";

export type Podcast = typeof podcasts.$inferSelect;
export type Episode = typeof podcastEpisodes.$inferSelect;
export type NewEpisode = typeof podcastEpisodes.$inferInsert;

/**
 * An episode as a list draws it: everything but the full show notes (which
 * can be tens of kilobytes each and are only read on the episode screen), plus
 * the few facts about its show that a row needs.
 */
export type EpisodeItem = Omit<Episode, "description"> & {
  showTitle: string;
  showImageUrl: string | null;
};

/** A show as a shelf draws it, with how many episodes are waiting in it. */
export type ShowItem = Podcast & { newCount: number };

export { SHOW_NAME_SQL, showName } from "@/services/podcasts/show-name";

export { chunk, newId, nowIso, yieldToUi } from "@/services/rows";

/**
 * Rows per INSERT. SQLite caps a statement at 999 bound values and an episode
 * row has about thirty columns, so thirty rows sits safely under it.
 */
export const INSERT_CHUNK = 30;
