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

export async function runMigrations() {
  await migrate(db, migrations);
  // Self-heal: ensure sync pipeline tables exist regardless of migration history
  await ensureSyncPipelineSchema();
  // Self-heal: ensure chat / local AI tables exist
  await ensureChatSchema();
}
