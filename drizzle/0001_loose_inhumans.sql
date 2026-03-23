PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`cover_url` text,
	`file_path` text,
	`source_uri` text,
	`file_size` integer,
	`last_modified` text,
	`total_pages` integer,
	`category` text,
	`status` text,
	`is_favorite` integer DEFAULT 0 NOT NULL,
	`added_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
INSERT INTO `__new_books`("id", "title", "author", "cover_url", "file_path", "source_uri", "file_size", "last_modified", "total_pages", "category", "status", "is_favorite", "added_at", "completed_at") SELECT "id", "title", "author", "cover_url", "file_path", "source_uri", "file_size", "last_modified", "total_pages", "category", "status", "is_favorite", "added_at", "completed_at" FROM `books`;--> statement-breakpoint
DROP TABLE `books`;--> statement-breakpoint
ALTER TABLE `__new_books` RENAME TO `books`;--> statement-breakpoint
PRAGMA foreign_keys=ON;