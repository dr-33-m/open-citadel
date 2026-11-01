ALTER TABLE `journey_notes` ADD `due_on` text;--> statement-breakpoint
ALTER TABLE `journey_notes` ADD `resolved_at` text;--> statement-breakpoint
CREATE INDEX `journey_notes_kind_idx` ON `journey_notes` (`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `samwell_profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`updated_at` text NOT NULL
);
