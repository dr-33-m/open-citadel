import type {
  bookmarks as bookmarksTable,
  highlights as highlightsTable,
} from "@/db/schema";

export type Bookmark = typeof bookmarksTable.$inferSelect;
export type Highlight = typeof highlightsTable.$inferSelect;

/** Theme colours a row needs, hoisted so rows never subscribe per cell. */
export type RowColors = {
  primary?: string;
  mutedForeground?: string;
};

/** Hoisted: a fresh style object per render re-lays the scroll region out. */
export const FILL = { flex: 1 } as const;

/** Tags and locators are stored as JSON strings; a bad one reads as `fallback`. */
export function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
