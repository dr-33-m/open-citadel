DROP TABLE IF EXISTS `compass_actions`;--> statement-breakpoint
DROP TABLE IF EXISTS `compass_checkins`;--> statement-breakpoint
DROP TABLE IF EXISTS `compass_milestones`;--> statement-breakpoint
DROP TABLE IF EXISTS `compass_goals`;--> statement-breakpoint
DELETE FROM `journey_notes` WHERE `kind` = 'goal_finished';--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`category` text NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`outcome_target` real,
	`outcome_unit` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `trackables` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`time_of_day` text,
	`schedule` text NOT NULL,
	`measurement` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `trackable_pauses` (
	`id` text PRIMARY KEY NOT NULL,
	`trackable_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trackable_id`) REFERENCES `trackables`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `trackable_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`trackable_id` text NOT NULL,
	`date` text NOT NULL,
	`completed` integer,
	`value` real,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trackable_id`) REFERENCES `trackables`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `trackables_goal_idx` ON `trackables` (`goal_id`);--> statement-breakpoint
CREATE INDEX `trackable_pauses_trackable_idx` ON `trackable_pauses` (`trackable_id`);--> statement-breakpoint
CREATE INDEX `trackable_logs_trackable_date_idx` ON `trackable_logs` (`trackable_id`,`date`);--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `goal_id` text REFERENCES goals(id);--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `kind` text DEFAULT 'reading' NOT NULL;
