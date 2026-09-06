import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";

import migrations from "../../drizzle/migrations";
import { db } from "./client";

/**
 * Ensures the sync pipeline tables exist even if migration 0007 was partially
 * applied (e.g. the old broken JS format ran but only created some statements).
 * Uses IF NOT EXISTS / PRAGMA so it is always safe to call.
 */
async function ensureSyncPipelineSchema(): Promise<void> {
  // ── Add missing columns to books ──────────────────────────────────────────
  const booksInfo: { name: string }[] = db.all(
    sql`PRAGMA table_info(books)`,
  ) as { name: string }[];
  const booksCols = new Set(booksInfo.map((r) => r.name));

  if (!booksCols.has("sync_state")) {
    db.run(sql`ALTER TABLE \`books\` ADD \`sync_state\` text DEFAULT 'ready'`);
  }
  if (!booksCols.has("meta_fingerprint")) {
    db.run(sql`ALTER TABLE \`books\` ADD \`meta_fingerprint\` text`);
  }
  if (!booksCols.has("meta_error")) {
    db.run(sql`ALTER TABLE \`books\` ADD \`meta_error\` text`);
  }
  if (!booksCols.has("title_locked")) {
    db.run(
      sql`ALTER TABLE \`books\` ADD \`title_locked\` integer NOT NULL DEFAULT 0`,
    );
  }

  // ── Create sync_jobs if missing ───────────────────────────────────────────
  db.run(sql`CREATE TABLE IF NOT EXISTS \`sync_jobs\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`directory_uri\` text NOT NULL,
    \`status\` text NOT NULL DEFAULT 'running',
    \`phase\` text NOT NULL DEFAULT 'scanning',
    \`scan_done\` integer NOT NULL DEFAULT 0,
    \`scan_total\` integer NOT NULL DEFAULT 0,
    \`import_done\` integer NOT NULL DEFAULT 0,
    \`import_total\` integer NOT NULL DEFAULT 0,
    \`prepare_done\` integer NOT NULL DEFAULT 0,
    \`prepare_total\` integer NOT NULL DEFAULT 0,
    \`failed_count\` integer NOT NULL DEFAULT 0,
    \`started_at\` text NOT NULL,
    \`updated_at\` text NOT NULL,
    \`finished_at\` text,
    \`last_error\` text
  )`);

  // ── Create sync_items if missing ──────────────────────────────────────────
  db.run(sql`CREATE TABLE IF NOT EXISTS \`sync_items\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`job_id\` text NOT NULL REFERENCES \`sync_jobs\`(\`id\`),
    \`book_id\` text REFERENCES \`books\`(\`id\`),
    \`source_uri\` text NOT NULL,
    \`format\` text NOT NULL,
    \`fingerprint\` text NOT NULL,
    \`status\` text NOT NULL DEFAULT 'pending',
    \`attempts\` integer NOT NULL DEFAULT 0,
    \`next_retry_at\` text,
    \`error\` text,
    \`created_at\` text NOT NULL,
    \`updated_at\` text NOT NULL
  )`);

  // ── Counters added after sync_jobs shipped ────────────────────────────────
  const jobsInfo: { name: string }[] = db.all(
    sql`PRAGMA table_info(sync_jobs)`,
  ) as { name: string }[];
  const jobsCols = new Set(jobsInfo.map((r) => r.name));

  if (!jobsCols.has("added_count")) {
    db.run(
      sql`ALTER TABLE \`sync_jobs\` ADD \`added_count\` integer NOT NULL DEFAULT 0`,
    );
  }
  if (!jobsCols.has("skipped_count")) {
    db.run(
      sql`ALTER TABLE \`sync_jobs\` ADD \`skipped_count\` integer NOT NULL DEFAULT 0`,
    );
  }

  // ── Files that will not import, remembered across jobs ────────────────────
  db.run(sql`CREATE TABLE IF NOT EXISTS \`sync_skips\` (
    \`source_uri\` text PRIMARY KEY NOT NULL,
    \`fingerprint\` text NOT NULL,
    \`error\` text,
    \`failed_at\` text NOT NULL
  )`);

  // ── Indexes (IF NOT EXISTS is safe) ───────────────────────────────────────
  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`sync_items_job_uri_idx\`
    ON \`sync_items\` (\`job_id\`, \`source_uri\`)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS \`sync_items_status_idx\`
    ON \`sync_items\` (\`job_id\`, \`status\`, \`next_retry_at\`)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS \`sync_jobs_status_idx\`
    ON \`sync_jobs\` (\`status\`, \`updated_at\`)`);
}

async function ensureChatSchema(): Promise<void> {
  db.run(sql`CREATE TABLE IF NOT EXISTS \`llama_models\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`filename\` text NOT NULL,
    \`file_path\` text,
    \`download_url\` text NOT NULL,
    \`size_bytes\` integer,
    \`is_downloaded\` integer NOT NULL DEFAULT 0,
    \`is_active\` integer NOT NULL DEFAULT 0,
    \`downloaded_at\` text
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS \`chat_sessions\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`book_id\` text REFERENCES \`books\`(\`id\`) ON DELETE SET NULL,
    \`title\` text NOT NULL,
    \`context_text\` text,
    \`context_locator\` text,
    \`created_at\` text NOT NULL,
    \`updated_at\` text NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS \`chat_messages\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`session_id\` text NOT NULL REFERENCES \`chat_sessions\`(\`id\`) ON DELETE CASCADE,
    \`role\` text NOT NULL,
    \`content\` text NOT NULL,
    \`created_at\` text NOT NULL
  )`);

  db.run(sql`CREATE INDEX IF NOT EXISTS \`chat_messages_session_idx\`
    ON \`chat_messages\` (\`session_id\`, \`created_at\`)`);

  // Add capability columns to llama_models if missing
  const modelsInfo: { name: string }[] = db.all(
    sql`PRAGMA table_info(llama_models)`,
  ) as { name: string }[];
  const modelsCols = new Set(modelsInfo.map((r) => r.name));

  if (!modelsCols.has("supports_speculative_decoding")) {
    db.run(
      sql`ALTER TABLE \`llama_models\` ADD \`supports_speculative_decoding\` integer NOT NULL DEFAULT 0`,
    );
  }
  if (!modelsCols.has("supports_thinking")) {
    db.run(
      sql`ALTER TABLE \`llama_models\` ADD \`supports_thinking\` integer NOT NULL DEFAULT 0`,
    );
  }
  if (!modelsCols.has("supports_tool_calling")) {
    db.run(
      sql`ALTER TABLE \`llama_models\` ADD \`supports_tool_calling\` integer NOT NULL DEFAULT 0`,
    );
  }

  // Add chat_session_id to highlights if missing
  const highlightsInfo: { name: string }[] = db.all(
    sql`PRAGMA table_info(highlights)`,
  ) as { name: string }[];
  const highlightCols = new Set(highlightsInfo.map((r) => r.name));
  if (!highlightCols.has("chat_session_id")) {
    db.run(sql`ALTER TABLE \`highlights\` ADD \`chat_session_id\` text`);
  }

  // Add chat_session_id to thoughts if missing
  const thoughtsInfo: { name: string }[] = db.all(
    sql`PRAGMA table_info(thoughts)`,
  ) as { name: string }[];
  const thoughtCols = new Set(thoughtsInfo.map((r) => r.name));
  if (!thoughtCols.has("chat_session_id")) {
    db.run(sql`ALTER TABLE \`thoughts\` ADD \`chat_session_id\` text`);
  }
}

/**
 * Daily reading history, backing the timeline calendar's activity dots.
 * Same self-heal shape as the tables above so it lands regardless of a
 * device's migration history.
 */
async function ensureReadingDaysSchema(): Promise<void> {
  db.run(sql`CREATE TABLE IF NOT EXISTS \`reading_days\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`day\` text NOT NULL,
    \`book_id\` text NOT NULL,
    \`progress_delta\` real NOT NULL DEFAULT 0,
    \`updated_at\` text NOT NULL
  )`);
  // The calendar reads a month at a time, so `day` carries every lookup.
  db.run(
    sql`CREATE INDEX IF NOT EXISTS \`reading_days_day_idx\` ON \`reading_days\` (\`day\`)`,
  );
}

/**
 * Compass's rebuilt domain: Goal → Trackable → Schedule → Measurement → Log.
 *
 * The four `compass_*` tables this replaces are dropped unconditionally. They
 * held a different model entirely — milestones, effort units, morning/night
 * check-ins — and nothing in them maps onto the new shape, so there is no
 * migration to write, only a deletion.
 *
 * The new tables are created under fresh, unprefixed names. Reusing
 * `compass_goals` for a different shape would make this function ambiguous:
 * `CREATE TABLE IF NOT EXISTS compass_goals` would silently leave the OLD
 * shape in place on a device where migration 0018 half-applied, which is the
 * exact failure class the hand-written migration workflow exists to prevent.
 */
async function ensureCompassSchema(): Promise<void> {
  db.run(sql`DROP TABLE IF EXISTS \`compass_actions\``);
  db.run(sql`DROP TABLE IF EXISTS \`compass_checkins\``);
  db.run(sql`DROP TABLE IF EXISTS \`compass_milestones\``);
  db.run(sql`DROP TABLE IF EXISTS \`compass_goals\``);

  db.run(sql`CREATE TABLE IF NOT EXISTS \`goals\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`description\` text,
    \`start_date\` text NOT NULL,
    \`end_date\` text NOT NULL,
    \`category\` text NOT NULL,
    \`priority\` text NOT NULL DEFAULT 'MEDIUM',
    \`status\` text NOT NULL DEFAULT 'ACTIVE',
    \`outcome_target\` real,
    \`outcome_unit\` text,
    \`is_primary\` integer NOT NULL DEFAULT 0,
    \`created_at\` text NOT NULL,
    \`updated_at\` text NOT NULL
  )`);

  // Self-heal `is_primary` onto a `goals` table that predates it.
  const goalsInfo: { name: string }[] = db.all(
    sql`PRAGMA table_info(goals)`,
  ) as { name: string }[];
  if (!new Set(goalsInfo.map((r) => r.name)).has("is_primary")) {
    db.run(sql`ALTER TABLE \`goals\` ADD \`is_primary\` integer NOT NULL DEFAULT 0`);
  }

  // Backfill: a device that already had goals gets its oldest active one as
  // the primary, so an existing single-goal user is not left with no primary
  // and a Samwell that never steers. Only runs while nothing is primary yet,
  // so it is a one-time promotion the reader can override afterwards.
  db.run(sql`
    UPDATE \`goals\` SET \`is_primary\` = 1
    WHERE \`id\` = (
      SELECT \`id\` FROM \`goals\` WHERE \`status\` = 'ACTIVE'
      ORDER BY \`created_at\` ASC LIMIT 1
    )
    AND NOT EXISTS (SELECT 1 FROM \`goals\` WHERE \`is_primary\` = 1)
  `);

  db.run(sql`CREATE TABLE IF NOT EXISTS \`trackables\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`goal_id\` text NOT NULL REFERENCES \`goals\`(\`id\`) ON DELETE cascade,
    \`title\` text NOT NULL,
    \`description\` text,
    \`start_date\` text NOT NULL,
    \`end_date\` text NOT NULL,
    \`time_of_day\` text,
    \`schedule\` text NOT NULL,
    \`measurement\` text NOT NULL,
    \`status\` text NOT NULL DEFAULT 'ACTIVE',
    \`created_at\` text NOT NULL,
    \`updated_at\` text NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS \`trackable_pauses\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`trackable_id\` text NOT NULL REFERENCES \`trackables\`(\`id\`) ON DELETE cascade,
    \`start_date\` text NOT NULL,
    \`end_date\` text,
    \`created_at\` text NOT NULL
  )`);

  db.run(sql`CREATE TABLE IF NOT EXISTS \`trackable_logs\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`trackable_id\` text NOT NULL REFERENCES \`trackables\`(\`id\`) ON DELETE cascade,
    \`date\` text NOT NULL,
    \`completed\` integer,
    \`value\` real,
    \`note\` text,
    \`created_at\` text NOT NULL
  )`);

  db.run(
    sql`CREATE INDEX IF NOT EXISTS \`trackables_goal_idx\` ON \`trackables\` (\`goal_id\`)`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS \`trackable_pauses_trackable_idx\` ON \`trackable_pauses\` (\`trackable_id\`)`,
  );
  // The deck asks "what is due today" and consistency asks for a window, so
  // every read of this table is by trackable and date together.
  db.run(sql`CREATE INDEX IF NOT EXISTS \`trackable_logs_trackable_date_idx\`
    ON \`trackable_logs\` (\`trackable_id\`, \`date\`)`);

  // How each ended goal ended. Separate from `goals` rather than more columns
  // on it: every row here is written once and never updated except to fill in
  // the takeaway, and a goal that is still running has nothing to say in any
  // of them.
  db.run(sql`CREATE TABLE IF NOT EXISTS \`goal_outcomes\` (
    \`goal_id\` text PRIMARY KEY NOT NULL REFERENCES \`goals\`(\`id\`) ON DELETE cascade,
    \`completed\` integer NOT NULL,
    \`ended_on\` text NOT NULL,
    \`execution_ratio\` real,
    \`outcome_value\` real,
    \`outcome_target\` real,
    \`outcome_unit\` text,
    \`reason\` text,
    \`takeaway\` text,
    \`created_at\` text NOT NULL
  )`);

  // A Compass conversation is an ordinary chat session pointed at a goal.
  const sessionInfo: { name: string }[] = db.all(
    sql`PRAGMA table_info(chat_sessions)`,
  ) as { name: string }[];
  const sessionCols = new Set(sessionInfo.map((r) => r.name));

  if (!sessionCols.has("goal_id")) {
    db.run(sql`ALTER TABLE \`chat_sessions\` ADD \`goal_id\` text REFERENCES \`goals\`(\`id\`)`);
  }
  if (!sessionCols.has("kind")) {
    db.run(
      sql`ALTER TABLE \`chat_sessions\` ADD \`kind\` text NOT NULL DEFAULT 'reading'`,
    );
  }
}

export async function runMigrations() {
  await migrate(db, migrations);
  // Self-heal: ensure sync pipeline tables exist regardless of migration history
  await ensureSyncPipelineSchema();
  // Self-heal: ensure chat / local AI tables exist
  await ensureChatSchema();
  // Self-heal: ensure daily reading history exists
  await ensureReadingDaysSchema();
  // Self-heal: drop the old Compass model and ensure the new one exists
  await ensureCompassSchema();
}
