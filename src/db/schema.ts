import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { GoalCategory, GoalPriority, LifecycleStatus } from "samwell-shared";

export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  coverUrl: text("cover_url"),
  filePath: text("file_path"),
  sourceUri: text("source_uri"),
  fileSize: integer("file_size"),
  lastModified: text("last_modified"),
  totalPages: integer("total_pages"),
  category: text("category"),
  status: text("status", {
    enum: ["reading", "queued", "archived", "favorite"],
  }),
  isFavorite: integer("is_favorite").notNull().default(0),
  addedAt: text("added_at").notNull(),
  completedAt: text("completed_at"),
  format: text("format").$type<"epub">(),
  // Sync pipeline fields
  syncState: text("sync_state")
    .$type<"ready" | "pending_meta" | "processing_meta" | "meta_failed">()
    .default("ready"),
  metaFingerprint: text("meta_fingerprint"),
  metaError: text("meta_error"),
  /** When 1, sync will not overwrite the user-edited title */
  titleLocked: integer("title_locked").notNull().default(0),
  /** Manual position within the queue (lower = earlier). Null for books
   * that predate this column or have never been queued. */
  queueOrder: integer("queue_order"),
  /**
   * `article` is a blog post opened in the reader: a small EPUB the app wrote
   * (`services/blogs/article-book.ts`), so highlights, notes, tags, chats and
   * read-aloud work on it exactly as on a book. It has no `sourceUri`, so a
   * folder scan never touches it, and the book shelves leave it out.
   */
  kind: text("kind").$type<BookKind>().notNull().default("book"),
});

export type BookKind = "book" | "article";

export const readingProgress = sqliteTable("reading_progress", {
  id: text("id").primaryKey(),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id),
  currentPage: integer("current_page").notNull(),
  percentage: real("percentage").notNull(),
  locator: text("locator"),
  updatedAt: text("updated_at").notNull(),
});

export const highlights = sqliteTable(
  "highlights",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id),
    text: text("text").notNull(),
    locator: text("locator"),
    page: integer("page"),
    chapter: text("chapter"),
    color: text("color").default("#f2ca50"),
    tags: text("tags"),
    chatSessionId: text("chat_session_id"),
    /** JSON {before, after}: chapter text around the highlight, captured at creation */
    context: text("context"),
    createdAt: text("created_at").notNull(),
    /** Local calendar day captured at creation, for indexed Timeline marks. */
    createdDay: text("created_day").notNull().default(""),
  },
  (table) => [index("highlights_created_day_idx").on(table.createdDay)],
);

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  highlightId: text("highlight_id").references(() => highlights.id),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id),
  text: text("text").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  createdAt: text("created_at").notNull(),
});

export const bookCollections = sqliteTable("book_collections", {
  bookId: text("book_id")
    .notNull()
    .references(() => books.id),
  collectionId: text("collection_id")
    .notNull()
    .references(() => collections.id),
});

export const bookmarks = sqliteTable("bookmarks", {
  id: text("id").primaryKey(),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id),
  locator: text("locator").notNull(),
  page: integer("page"),
  chapter: text("chapter"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
});

export const thoughts = sqliteTable(
  "thoughts",
  {
    id: text("id").primaryKey(),
    text: text("text").notNull(),
    color: text("color").default("#f2ca50"),
    tags: text("tags"),
    chatSessionId: text("chat_session_id"),
    createdAt: text("created_at").notNull(),
    /** Local calendar day captured at creation, for indexed Timeline marks. */
    createdDay: text("created_day").notNull().default(""),
    updatedAt: text("updated_at"),
  },
  (table) => [index("thoughts_created_day_idx").on(table.createdDay)],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── Chat / Local AI tables ────────────────────────────────────────────────────

/**
 * What this device holds of the on-device brain catalogue
 * (`services/device-llm/catalogue.ts`), one row per entry.
 *
 * No file paths. ExecuTorch keeps the files in its own cache, keyed by URL, and
 * hands back where they are on request; a path stored here would go stale the
 * first time iOS moved the app's container on a restore.
 */
export const deviceModels = sqliteTable("device_models", {
  /** The catalogue entry's id. */
  id: text("id").primaryKey(),
  /** Bytes of every file the model needs, from Hugging Face. Null until asked. */
  sizeBytes: integer("size_bytes"),
  isDownloaded: integer("is_downloaded").notNull().default(0),
  isActive: integer("is_active").notNull().default(0),
  downloadedAt: text("downloaded_at"),
});

export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey(),
  bookId: text("book_id").references(() => books.id, { onDelete: "set null" }),
  /**
   * The goal a Compass conversation belonged to when it started, or null when
   * it started before there was one.
   *
   * Nullable, and deliberately not a filter: a conversation that talked
   * someone into their goal is part of that goal's history and should not
   * vanish from the list the moment the goal is created.
   *
   * No `onDelete` here on purpose, matching the DDL that actually shipped
   * (`0018_trackables.sql` and the self-heal both add it bare). Goals are
   * retired by status and never hard-deleted, so the action would be
   * unreachable, and declaring one drizzle has not written to the device
   * would only make this file a less reliable description of it.
   */
  goalId: text("goal_id").references(() => goals.id),
  /**
   * Which surface the conversation belongs to.
   *
   * A Compass conversation is a chat — transcript, streaming, markdown, cited
   * highlights, a title, a place in history — so it lives in these tables
   * rather than in a second thread system that would drift from this one.
   * This column is the only thing keeping the histories apart.
   *
   * `onboarding` is the concierge conversation, and being a third value here
   * is what keeps it out of the reading history sheet without anything having
   * to filter it: `listSessions` already asks for one kind at a time. No
   * migration was needed to add it, since this is a text column with a
   * default and SQLite has no enum to widen.
   */
  kind: text("kind").$type<"reading" | "compass" | "onboarding">().notNull().default("reading"),
  title: text("title").notNull(),
  contextText: text("context_text"),
  contextLocator: text("context_locator"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  /** How far Samwell's journal has read: the `created_at` of the last message
   *  it covered. Null until it has read any. Added by the self-heal. */
  journaledAt: text("journaled_at"),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["system", "user", "assistant", "tool"] }).notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
  /**
   * Which engine the message went through. Only `cloud` messages are ever
   * sent to be journaled; null (older rows) counts as not cloud. Added by the
   * self-heal, not a migration: nothing in `drizzle/` creates this table.
   */
  via: text("via").$type<"cloud" | "device">(),
});

/**
 * A highlight/thought Samwell proposed mid-chat via suggest_highlight /
 * suggest_thought. Rendered inline as a [[suggest:kind:id]] marker in the
 * assistant's reply; nothing is saved to the user's real library until they
 * approve it here.
 */
export const chatSuggestions = sqliteTable("chat_suggestions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"highlight" | "thought">().notNull(),
  status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
  text: text("text").notNull(),
  tags: text("tags"),
  bookId: text("book_id"),
  /** JSON Locator, captured at suggestion time (current reading position). */
  locator: text("locator"),
  /** The highlights.id / thoughts.id created once approved. */
  resultEntryId: text("result_entry_id"),
  createdAt: text("created_at").notNull(),
});

// ── Sync pipeline tables ─────────────────────────────────────────────────────

export const syncJobs = sqliteTable("sync_jobs", {
  id: text("id").primaryKey(),
  directoryUri: text("directory_uri").notNull(),
  status: text("status")
    .$type<"running" | "completed" | "failed" | "cancelled">()
    .notNull()
    .default("running"),
  phase: text("phase")
    .$type<"scanning" | "importing" | "preparing" | "finalizing">()
    .notNull()
    .default("scanning"),
  scanDone: integer("scan_done").notNull().default(0),
  scanTotal: integer("scan_total").notNull().default(0),
  importDone: integer("import_done").notNull().default(0),
  importTotal: integer("import_total").notNull().default(0),
  prepareDone: integer("prepare_done").notNull().default(0),
  prepareTotal: integer("prepare_total").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  /** New books this run actually put in the library. `importTotal` counts
   * every file in the folder, so it cannot answer "what did this sync add". */
  addedCount: integer("added_count").notNull().default(0),
  /** Files passed over because they already failed on this exact version.
   * See `sync_skips` — this is the number the scan notice reports. */
  skippedCount: integer("skipped_count").notNull().default(0),
  startedAt: text("started_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  finishedAt: text("finished_at"),
  lastError: text("last_error"),
});

export const syncItems = sqliteTable("sync_items", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => syncJobs.id),
  bookId: text("book_id").references(() => books.id),
  sourceUri: text("source_uri").notNull(),
  format: text("format").$type<"epub">().notNull(),
  fingerprint: text("fingerprint").notNull(),
  status: text("status")
    .$type<"pending" | "processing" | "done" | "retry" | "failed" | "skipped">()
    .notNull()
    .default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextRetryAt: text("next_retry_at"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Files that will not import, remembered so they are never tried again.
 *
 * A book whose EPUB cannot be read fails three times with backoff before the
 * pipeline gives up, which is about eighty-five seconds of a sync spent on a
 * file that was never going to open. Without a record of that, the next scan
 * starts the same eighty-five seconds over, and every scan after it.
 *
 * Keyed by the file, qualified by its fingerprint: the claim is not "this
 * book is broken" but "this exact version of this file did not open". Replace
 * the file in the folder and the fingerprint moves, so the skip no longer
 * matches and it is tried again on its own. Delete it from the folder and the
 * row goes with it on the next scan.
 *
 * Separate from `sync_items`, which are per-job and go away with their job —
 * this has to outlive every job to be worth anything.
 */
export const syncSkips = sqliteTable("sync_skips", {
  /** The file. One row per source, replaced when a new version fails too. */
  sourceUri: text("source_uri").primaryKey(),
  /** The version that failed. A different one is a different question. */
  fingerprint: text("fingerprint").notNull(),
  error: text("error"),
  failedAt: text("failed_at").notNull(),
});

// ── Compass: Goal → Trackable → Schedule → Measurement → Log ────────────────
//
// Consistency is NOT here. It is derived from schedules and logs by
// `services/consistency.ts` on every read, because a stored score is a score
// that can disagree with the rows it came from — and the number this feature
// shows is a claim about the user's own discipline. There are no streaks in
// this model, by design.

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  /** Local calendar days, YYYY-MM-DD — never an instant. */
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  category: text("category").$type<GoalCategory>().notNull(),
  priority: text("priority").$type<GoalPriority>().notNull().default("MEDIUM"),
  status: text("status").$type<LifecycleStatus>().notNull().default("ACTIVE"),
  /**
   * The one goal that must not slip. At most one active goal is primary; the
   * rest are tracked because the user wants to, but this is the one Samwell
   * steers back toward and the one the overview marks. `0`/`1`, matching the
   * other boolean columns here.
   */
  isPrimary: integer("is_primary").notNull().default(0),
  /**
   * The numeric outcome, when there is one: 4000 / "USD".
   *
   * Execution and outcome are different facts — 92% consistent and $1,200 of
   * $4,000 answer different questions — so they are never averaged into one
   * number. Null for a purely behavioural goal.
   */
  outcomeTarget: real("outcome_target"),
  outcomeUnit: text("outcome_unit"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const trackables = sqliteTable(
  "trackables",
  {
    id: text("id").primaryKey(),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    /** `HH:MM`, 24-hour. Orders the planner's day list; never gates a log. */
    timeOfDay: text("time_of_day"),
    /**
     * `Schedule` and `Measurement` as JSON.
     *
     * Both are strictly 1:1 with a trackable and are never queried by their
     * internals — occurrence expansion is an in-memory pass over tens of rows.
     * The alternative is one wide sparse table in which invalid states are
     * freely representable (a DAILY schedule carrying `daysOfWeek`, a
     * COMPLETION measurement carrying a target); SQLite cannot enforce a
     * six-way discriminated union and a zod parse on read can.
     *
     * Deliberately plain `text`, not drizzle's `mode: "json"`, which hands back
     * `any` with no validation and would let a corrupt row propagate a
     * malformed object into the occurrence engine. Parse explicitly and let one
     * bad row degrade one trackable.
     */
    schedule: text("schedule").notNull(),
    measurement: text("measurement").notNull(),
    status: text("status").$type<LifecycleStatus>().notNull().default("ACTIVE"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("trackables_goal_idx").on(t.goalId)],
);

/**
 * When a trackable was paused, as a window with its own lifecycle.
 *
 * A `status = "PAUSED"` column can only say "paused right now". The moment the
 * user resumes, nothing records that it was paused from the 5th to the 12th,
 * so the consistency denominator silently re-absorbs those days and the score
 * drops retroactively for time the user was never expected to show up. Paused
 * is not missed, and that promise needs a temporal fact to keep it.
 *
 * `endDate` is null while the pause is open.
 */
export const trackablePauses = sqliteTable(
  "trackable_pauses",
  {
    id: text("id").primaryKey(),
    trackableId: text("trackable_id")
      .notNull()
      .references(() => trackables.id, { onDelete: "cascade" }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("trackable_pauses_trackable_idx").on(t.trackableId)],
);

export const trackableLogs = sqliteTable(
  "trackable_logs",
  {
    id: text("id").primaryKey(),
    trackableId: text("trackable_id")
      .notNull()
      .references(() => trackables.id, { onDelete: "cascade" }),
    /** The local day the log counts for. */
    date: text("date").notNull(),
    /**
     * Three states, not a boolean:
     *
     *   1    — done, for a COMPLETION measurement
     *   null — done, and `value` carries the number
     *   0    — an explicit "this did not happen"
     *
     * A value-carrying log stores the raw number and leaves this null on
     * purpose. Writing `0` because 350 < 500 would bake a derived judgement
     * into a stored fact, so editing the target later — or turning on partial
     * credit later — would contradict the row. Whether the target was met is
     * derived at read time instead, which is what keeps partial credit a
     * future decision rather than a future migration.
     */
    completed: integer("completed"),
    value: real("value"),
    /**
     * The journal. Written on wins as well as misses: what you overcame to do
     * it is as much material for a check-in as why you didn't.
     */
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  // Not unique: a flexible target ("six times a week") is logged several times
  // in a day by design.
  (t) => [index("trackable_logs_trackable_date_idx").on(t.trackableId, t.date)],
);

// ── Journey memory (on-device; the arc of the user's reading + execution) ─────

/**
 * How a goal ended: the reconciliation, written once when it is closed out.
 *
 * The logs survive archiving, so most of a past goal's page can be recomputed
 * from them. Three things cannot. The consistency figure has to be the one the
 * reader was looking at when they pressed the button, because the denominator
 * keeps growing after the end date and a number that drifted afterwards would
 * disagree with the note in their journal. The reason someone stopped exists
 * nowhere else at all. And Samwell's takeaway is written once, from the whole
 * run, and is not something to re-ask the model for every time the sheet opens.
 *
 * One row per ended goal, keyed by the goal, so re-finishing is a replace
 * rather than a second history.
 */
export const goalOutcomes = sqliteTable("goal_outcomes", {
  goalId: text("goal_id")
    .primaryKey()
    .references(() => goals.id, { onDelete: "cascade" }),
  /** `1` finished, `0` stopped early. The difference the whole table exists for. */
  completed: integer("completed").notNull(),
  /** The local day it was closed out, `YYYY-MM-DD`. Not the goal's end date:
   *  a goal can be finished early on its number, or stopped months before. */
  endedOn: text("ended_on").notNull(),
  /** 0..1 as it stood at that moment, or null when nothing was ever due. */
  executionRatio: real("execution_ratio"),
  /** What it banked against its number, frozen the same way. Null when the
   *  goal carried no numeric outcome. */
  outcomeValue: real("outcome_value"),
  outcomeTarget: real("outcome_target"),
  outcomeUnit: text("outcome_unit"),
  /** Why they stopped, in their own words. Null on a finished goal. */
  reason: text("reason"),
  /**
   * Samwell's reading of the run.
   *
   * Null until it arrives: it is a cloud call made after the goal is already
   * archived, so the sheet has to be able to draw a past goal that has no
   * takeaway yet, and one that never got a takeaway because the request failed.
   */
  takeaway: text("takeaway"),
  createdAt: text("created_at").notNull(),
});

export const journeyNotes = sqliteTable("journey_notes", {
  id: text("id").primaryKey(),
  /** 'reflection' = distilled by Samwell (from a conversation, or an approved
   *  Compass check-in); the rest are written deterministically. */
  kind: text("kind")
    .$type<"reflection" | "book_finished" | "book_removed" | "goal_finished">()
    .notNull(),
  text: text("text").notNull(),
  /** JSON string[] for keyword retrieval */
  tags: text("tags"),
  /** Where it came from, for provenance: `chat:<sessionId>`, a book id, a goal id. */
  sourceRef: text("source_ref"),
  createdAt: text("created_at").notNull(),
});

// ── Daily reading (did the user actually read that day?) ─────────────────────

/**
 * One row per (local day, book), accumulating how much of that book was read
 * that day as a 0..1 fraction of its length.
 *
 * `reading_progress` only ever holds a book's CURRENT position — it's updated
 * in place, so it can say where you are but never that you moved today. This
 * table is the history that answers "did you read?", which is the honest
 * signal behind the timeline calendar's activity dots (highlight COUNT was
 * the old proxy, and it rewarded annotating a single paragraph over reading
 * fifty pages).
 */
export const readingDays = sqliteTable("reading_days", {
  /** `${day}:${bookId}` — makes the daily upsert a primary-key hit. */
  id: text("id").primaryKey(),
  /** Local calendar day, `YYYY-MM-DD`. Local, not UTC: it has to line up with
   * the day cell the user taps in the calendar. */
  day: text("day").notNull(),
  bookId: text("book_id")
    .notNull()
    .references(() => books.id),
  /** Summed forward progress for the day, as a fraction of the book (0..1). */
  progressDelta: real("progress_delta").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

// ── Podcasts ─────────────────────────────────────────────────────────────────
//
// Modelled on AntennaPod's database (`PodDBAdapter`), so a reader can bring
// their AntennaPod backup over and carry on where they were: the same
// subscriptions, the same play state, positions, favourites, queue order and
// per-show settings. Its tables are flattened the way `books` already is:
// AntennaPod splits an episode across `FeedItems` and `FeedMedia`, and keeps
// the queue and favourites in tables of their own, but every podcast episode
// here has exactly one enclosure, so one row carries all of it.
//
// Listening statistics are not drawn anywhere yet. The columns that feed them
// (`played_duration_sec`, `last_played_at`, `completed_at`) and the per-day
// table below are written from day one, and imported from AntennaPod, so the
// screen can be built later over real history rather than starting empty.

/**
 * AntennaPod's `Feed.STATE_*`: a show you follow, one you are only looking at
 * (opened from Explore), or one you stopped following but kept the history of
 * (AntennaPod 3.5's archive; only arrives through an import for now).
 */
export type PodcastState = "subscribed" | "preview" | "archived";
/** `FeedPreferences.NewEpisodesAction`: where a freshly published episode lands. */
export type NewEpisodesAction = "global" | "inbox" | "queue" | "nothing";
/** `FeedPreferences.AutoDownloadSetting` and `AutoDeleteAction`, as three-way switches. */
export type ShowSwitch = "global" | "on" | "off";
/** `FeedItem.NEW / UNPLAYED / PLAYED`. `new` is the inbox. */
export type EpisodePlayState = "new" | "unplayed" | "played";
export type EpisodeDownloadStatus =
  | "none"
  | "queued"
  | "downloading"
  | "downloaded"
  | "failed";

export const podcasts = sqliteTable(
  "podcasts",
  {
    id: text("id").primaryKey(),
    /** Where the feed is fetched from (AntennaPod `download_url`). Unique. */
    feedUrl: text("feed_url").notNull(),
    /** The feed's own id when it declares one (`feed_identifier`). */
    feedIdentifier: text("feed_identifier"),
    title: text("title").notNull(),
    /** A name the reader gave the show; wins over `title` wherever it is drawn. */
    customTitle: text("custom_title"),
    author: text("author"),
    description: text("description"),
    link: text("link"),
    imageUrl: text("image_url"),
    language: text("language"),
    feedType: text("feed_type").$type<"rss" | "atom">(),
    /** Funding / donation link (`payment_link`). */
    fundingUrl: text("funding_url"),
    state: text("state").$type<PodcastState>().notNull().default("subscribed"),
    subscribedAt: text("subscribed_at"),
    lastRefreshAt: text("last_refresh_at"),
    lastRefreshFailed: integer("last_refresh_failed").notNull().default(0),
    lastRefreshError: text("last_refresh_error"),
    /** `Last-Modified` or `ETag` from the last fetch, for a conditional GET (`last_update`). */
    httpValidator: text("http_validator"),
    /** Refreshed with everything else (`keep_updated`). */
    keepUpdated: integer("keep_updated").notNull().default(1),
    autoDownload: text("auto_download").$type<ShowSwitch>().notNull().default("global"),
    autoDelete: text("auto_delete").$type<ShowSwitch>().notNull().default("global"),
    newEpisodesAction: text("new_episodes_action")
      .$type<NewEpisodesAction>()
      .notNull()
      .default("global"),
    /** Null follows the global speed (AntennaPod stores -1 for that). */
    playbackSpeed: real("playback_speed"),
    skipIntroSec: integer("skip_intro_sec").notNull().default(0),
    skipEndingSec: integer("skip_ending_sec").notNull().default(0),
    /** Auto-download filters, kept verbatim from AntennaPod for a later settings screen. */
    includeFilter: text("include_filter"),
    excludeFilter: text("exclude_filter"),
    minDurationFilterSec: integer("min_duration_filter_sec"),
    /** JSON string array. AntennaPod's `#root` pseudo-tag is dropped on import. */
    tags: text("tags"),
    episodeSort: text("episode_sort").$type<"newest" | "oldest">().notNull().default("newest"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("podcasts_feed_url_idx").on(table.feedUrl),
    index("podcasts_state_idx").on(table.state),
  ],
);

export const podcastEpisodes = sqliteTable(
  "podcast_episodes",
  {
    id: text("id").primaryKey(),
    podcastId: text("podcast_id")
      .notNull()
      .references(() => podcasts.id, { onDelete: "cascade" }),
    /** The item's `<guid>` (`item_identifier`). The first thing matched on refresh. */
    guid: text("guid"),
    title: text("title").notNull(),
    /** Show notes, as the feed sent them (HTML, usually `content:encoded`). */
    description: text("description"),
    /**
     * The first lines of the show notes as plain text, made once when the
     * episode is written so a list row never strips HTML while scrolling.
     */
    summary: text("summary"),
    link: text("link"),
    pubDate: text("pub_date"),
    imageUrl: text("image_url"),
    /** The enclosure (`FeedMedia.download_url`). */
    audioUrl: text("audio_url").notNull(),
    mimeType: text("mime_type"),
    durationSec: integer("duration_sec").notNull().default(0),
    fileSize: integer("file_size"),
    /** Podcasting 2.0 `podcast:chapters` / `podcast:transcript`, fetched lazily later. */
    chaptersUrl: text("chapters_url"),
    transcriptUrl: text("transcript_url"),
    transcriptType: text("transcript_type"),
    playState: text("play_state").$type<EpisodePlayState>().notNull().default("unplayed"),
    positionSec: real("position_sec").notNull().default(0),
    /** Total time actually listened, across every session (`played_duration`). */
    playedDurationSec: real("played_duration_sec").notNull().default(0),
    /** When it was last listened to (`last_played_time`). */
    lastPlayedAt: text("last_played_at"),
    /** When it was last finished (`playback_completion_date`): the history list. */
    completedAt: text("completed_at"),
    isFavorite: integer("is_favorite").notNull().default(0),
    /** Place in Up Next, lower plays sooner. Null when it is not queued. */
    queuePosition: integer("queue_position"),
    downloadStatus: text("download_status")
      .$type<EpisodeDownloadStatus>()
      .notNull()
      .default("none"),
    /**
     * The downloaded file's name inside the app's podcast folder — a name, not
     * a path. iOS moves the app's container between launches, so an absolute
     * path stored here would go stale; this is resolved on use instead.
     */
    downloadFile: text("download_file"),
    /**
     * The cover saved with the download, so it is there offline: a name in the
     * same folder, resolved on use like `downloadFile`. Episodes that share a
     * picture (most of a show) share the one file.
     */
    downloadCover: text("download_cover"),
    downloadedAt: text("downloaded_at"),
    downloadError: text("download_error"),
    /** Cleared once a download is deleted, so auto-download does not fetch it again. */
    autoDownloadEligible: integer("auto_download_eligible").notNull().default(1),
    addedAt: text("added_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("podcast_episodes_podcast_pub_idx").on(table.podcastId, table.pubDate),
    index("podcast_episodes_play_state_idx").on(table.playState),
    index("podcast_episodes_queue_idx").on(table.queuePosition),
    index("podcast_episodes_last_played_idx").on(table.lastPlayedAt),
    index("podcast_episodes_download_idx").on(table.downloadStatus),
  ],
);

/** Podlove Simple Chapters, from the feed or an AntennaPod import (`SimpleChapters`). */
export const podcastChapters = sqliteTable(
  "podcast_chapters",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => podcastEpisodes.id, { onDelete: "cascade" }),
    startSec: real("start_sec").notNull(),
    title: text("title").notNull(),
    link: text("link"),
    imageUrl: text("image_url"),
  },
  (table) => [index("podcast_chapters_episode_idx").on(table.episodeId, table.startSec)],
);

/**
 * How long was listened to, per local day and episode — the listening
 * counterpart of `reading_days`, and the history the stats screen will read.
 */
export const podcastListeningDays = sqliteTable(
  "podcast_listening_days",
  {
    /** `${day}:${episodeId}`, so the running total is a primary-key upsert. */
    id: text("id").primaryKey(),
    day: text("day").notNull(),
    episodeId: text("episode_id").notNull(),
    podcastId: text("podcast_id").notNull(),
    seconds: real("seconds").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("podcast_listening_days_day_idx").on(table.day)],
);

// ── Blogs ────────────────────────────────────────────────────────────────────

/** `preview`: opened from Explore and not followed, kept so its posts can be read. */
export type BlogState = "subscribed" | "preview";

export const blogs = sqliteTable(
  "blogs",
  {
    id: text("id").primaryKey(),
    /** Where the feed is fetched from. Unique. */
    feedUrl: text("feed_url").notNull(),
    title: text("title").notNull(),
    /** The blog's home page. */
    siteUrl: text("site_url"),
    description: text("description"),
    imageUrl: text("image_url"),
    language: text("language"),
    state: text("state").$type<BlogState>().notNull().default("subscribed"),
    subscribedAt: text("subscribed_at"),
    lastRefreshAt: text("last_refresh_at"),
    /** Why the last refresh failed, in words for the blog's page; null when it worked. */
    lastRefreshError: text("last_refresh_error"),
    /** `ETag` or `Last-Modified` from the last fetch, for a conditional GET. */
    httpValidator: text("http_validator"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("blogs_feed_url_idx").on(table.feedUrl), index("blogs_state_idx").on(table.state)],
);

export const blogArticles = sqliteTable(
  "blog_articles",
  {
    id: text("id").primaryKey(),
    blogId: text("blog_id")
      .notNull()
      .references(() => blogs.id, { onDelete: "cascade" }),
    guid: text("guid"),
    /** The post on the web; unique within its blog, which is how a refresh knows a post it has seen. */
    link: text("link").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    /** Plain text for a list row. */
    summary: text("summary"),
    /** The post as the feed carried it. May be only a summary; the whole post is fetched on opening. */
    contentHtml: text("content_html"),
    imageUrl: text("image_url"),
    publishedAt: text("published_at").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    /** Null while unread. */
    readAt: text("read_at"),
    /** Null unless in the queue (kept to read later); the column predates the name. */
    savedAt: text("saved_at"),
    /** Null unless a favorite. */
    favoritedAt: text("favorited_at"),
    /** Null until marked finished. A finished post leaves Continue Reading and the queue. */
    finishedAt: text("finished_at"),
    /** The reader's copy (`books.kind = 'article'`), once opened. Never tidied away either. */
    bookId: text("book_id"),
  },
  (table) => [
    uniqueIndex("blog_articles_blog_link_idx").on(table.blogId, table.link),
    index("blog_articles_published_idx").on(table.publishedAt),
    index("blog_articles_saved_idx").on(table.savedAt),
    index("blog_articles_favorited_idx").on(table.favoritedAt),
    index("blog_articles_finished_idx").on(table.finishedAt),
    index("blog_articles_book_idx").on(table.bookId),
  ],
);
