CREATE TABLE `sync_skips` (
	`source_uri` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`error` text,
	`failed_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sync_jobs` ADD `added_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_jobs` ADD `skipped_count` integer DEFAULT 0 NOT NULL;
