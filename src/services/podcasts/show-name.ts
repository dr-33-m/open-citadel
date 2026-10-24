/**
 * The name a show goes by, in one place: in code for a row already read, and
 * in SQL for a query that selects or sorts by it. The podcasts screens, the
 * chat's cards and Samwell's tools all name a show through these.
 *
 * Its own module, free of React Native, so the tools' tests can load it.
 */
import { sql } from "drizzle-orm";

import { podcasts } from "@/db/schema";

/** The reader's own name for the show, when they gave it one. */
export function showName(show: { title: string; customTitle: string | null }): string {
  return show.customTitle?.trim() || show.title;
}

/** `showName` as SQL. Keep the two saying the same. */
export const SHOW_NAME_SQL = sql<string>`coalesce(nullif(trim(${podcasts.customTitle}), ''), ${podcasts.title})`;
