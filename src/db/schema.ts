import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { CompassAlignment, CompassCategory } from "samwell-shared";

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

// ── Compass (AI execution telemetry) tables ──────────────────────────────────

export const compassGoals = sqliteTable("compass_goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status")
    .$type<"active" | "completed" | "archived">()
    .notNull()
    .default("active"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const compassMilestones = sqliteTable("compass_milestones", {
  id: text("id").primaryKey(),
  goalId: text("goal_id")
    .notNull()
    .references(() => compassGoals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  effortUnitDefinition: text("effort_unit_definition").notNull(),
  status: text("status").$type<"active" | "completed">().notNull().default("active"),
  estimatedEffortUnits: real("estimated_effort_units").notNull(),
  completedEffortUnits: real("completed_effort_units").notNull().default(0),
  startDate: text("start_date").notNull(),
  /** The original commitment. Never rewritten — the gap to the projection is the product. */
  targetDate: text("target_date").notNull(),
  currentProjectedDate: text("current_projected_date"),
  actualCompletedDate: text("actual_completed_date"),
  originalEstimateDays: integer("original_estimate_days").notNull(),
  finalVarianceDays: integer("final_variance_days"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const compassCheckins = sqliteTable(
  "compass_checkins",
  {
    id: text("id").primaryKey(),
    goalId: text("goal_id")
      .notNull()
      .references(() => compassGoals.id, { onDelete: "cascade" }),
    milestoneId: text("milestone_id")
      .notNull()
      .references(() => compassMilestones.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    kind: text("kind").$type<"morning" | "night">().notNull(),
    rawText: text("raw_text").notNull(),
    missionSummary: text("mission_summary"),
    focusScore: integer("focus_score"),
    /** Units applied to the milestone by this (night) check-in; reversed on same-day overwrite. */
    effortUnitsCompleted: real("effort_units_completed"),
    pitWallMessage: text("pit_wall_message").notNull(),
    analysisJson: text("analysis_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("compass_checkins_day_kind_idx").on(t.goalId, t.localDate, t.kind)],
);

export const compassActions = sqliteTable("compass_actions", {
  id: text("id").primaryKey(),
  checkinId: text("checkin_id")
    .notNull()
    .references(() => compassCheckins.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  category: text("category").$type<CompassCategory>().notNull(),
  alignment: text("alignment").$type<CompassAlignment>().notNull(),
  minutes: integer("minutes"),
  effortUnits: real("effort_units"),
  planned: integer("planned").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// ── Journey memory (on-device; the arc of the user's reading + execution) ─────

export const journeyNotes = sqliteTable("journey_notes", {
  id: text("id").primaryKey(),
  /** 'reflection' = distilled from a night check-in; 'book_finished' = deterministic on finishing */
  kind: text("kind").$type<"reflection" | "book_finished">().notNull(),
  text: text("text").notNull(),
  /** JSON string[] for keyword retrieval */
  tags: text("tags"),
  /** originating checkinId / bookId, for provenance */
  sourceRef: text("source_ref"),
  createdAt: text("created_at").notNull(),
});
