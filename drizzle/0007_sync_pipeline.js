export default `ALTER TABLE \`books\` ADD \`sync_state\` text DEFAULT 'ready';--> statement-breakpoint
ALTER TABLE \`books\` ADD \`meta_fingerprint\` text;--> statement-breakpoint
ALTER TABLE \`books\` ADD \`meta_error\` text;--> statement-breakpoint
CREATE TABLE \`sync_jobs\` (
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
);--> statement-breakpoint
CREATE TABLE \`sync_items\` (
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
);--> statement-breakpoint
CREATE UNIQUE INDEX \`sync_items_job_uri_idx\` ON \`sync_items\` (\`job_id\`, \`source_uri\`);--> statement-breakpoint
CREATE INDEX \`sync_items_status_idx\` ON \`sync_items\` (\`job_id\`, \`status\`, \`next_retry_at\`);--> statement-breakpoint
CREATE INDEX \`sync_jobs_status_idx\` ON \`sync_jobs\` (\`status\`, \`updated_at\`);`;
