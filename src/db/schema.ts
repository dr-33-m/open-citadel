import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
});

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

export const highlights = sqliteTable("highlights", {
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
});

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

export const thoughts = sqliteTable("thoughts", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  color: text("color").default("#f2ca50"),
  tags: text("tags"),
  chatSessionId: text("chat_session_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── Chat / Local AI tables ────────────────────────────────────────────────────

export const localModels = sqliteTable("llama_models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  filename: text("filename").notNull(),
  filePath: text("file_path"),
  downloadUrl: text("download_url").notNull(),
  sizeBytes: integer("size_bytes"),
  isDownloaded: integer("is_downloaded").notNull().default(0),
  isActive: integer("is_active").notNull().default(0),
  downloadedAt: text("downloaded_at"),
  /** 1 if model binary supports multi-token prediction, 0 otherwise */
  supportsSpeculativeDecoding: integer("supports_speculative_decoding").notNull().default(0),
  /** 1 if model supports thinking/reasoning mode */
  supportsThinking: integer("supports_thinking").notNull().default(0),
  /** 1 if model supports tool/function calling */
  supportsToolCalling: integer("supports_tool_calling").notNull().default(0),
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
   * This column is the only thing keeping the two histories apart.
   */
  kind: text("kind").$type<"reading" | "compass">().notNull().default("reading"),
  title: text("title").notNull(),
  contextText: text("context_text"),
  contextLocator: text("context_locator"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["system", "user", "assistant", "tool"] }).notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
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

export const journeyNotes = sqliteTable("journey_notes", {
  id: text("id").primaryKey(),
  /** 'reflection' = distilled from a night check-in; 'book_finished'/'goal_finished' = deterministic */
  kind: text("kind").$type<"reflection" | "book_finished" | "goal_finished">().notNull(),
  text: text("text").notNull(),
  /** JSON string[] for keyword retrieval */
  tags: text("tags"),
  /** originating checkinId / bookId, for provenance */
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
