ALTER TABLE `podcast_episodes` ADD `transcript_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `podcast_episodes` ADD `transcript_source` text;--> statement-breakpoint
ALTER TABLE `podcast_episodes` ADD `transcript_file` text;--> statement-breakpoint
ALTER TABLE `podcast_episodes` ADD `transcript_job_id` text;--> statement-breakpoint
ALTER TABLE `podcast_episodes` ADD `transcript_book_id` text;--> statement-breakpoint
ALTER TABLE `podcast_episodes` ADD `transcript_at` text;--> statement-breakpoint
CREATE INDEX `podcast_episodes_transcript_idx` ON `podcast_episodes` (`transcript_status`,`transcript_at`);
