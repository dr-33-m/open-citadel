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
}

export async function runMigrations() {
  await migrate(db, migrations);
  // Self-heal: ensure sync pipeline tables exist regardless of migration history
  await ensureSyncPipelineSchema();
  // Self-heal: ensure chat / local AI tables exist
  await ensureChatSchema();
}
