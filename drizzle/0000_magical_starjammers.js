export default `CREATE TABLE \`app_settings\` (
\t\`key\` text PRIMARY KEY NOT NULL,
\t\`value\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`book_collections\` (
\t\`book_id\` text NOT NULL,
\t\`collection_id\` text NOT NULL,
\tFOREIGN KEY (\`book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE no action,
\tFOREIGN KEY (\`collection_id\`) REFERENCES \`collections\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE \`books\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`title\` text NOT NULL,
\t\`author\` text NOT NULL,
\t\`cover_url\` text,
\t\`file_path\` text,
\t\`source_uri\` text,
\t\`file_size\` integer,
\t\`last_modified\` text,
\t\`total_pages\` integer,
\t\`category\` text,
\t\`status\` text,
\t\`added_at\` text NOT NULL,
\t\`completed_at\` text
);
--> statement-breakpoint
CREATE TABLE \`collections\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`name\` text NOT NULL,
\t\`icon\` text,
\t\`created_at\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`highlights\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`book_id\` text NOT NULL,
\t\`text\` text NOT NULL,
\t\`locator\` text,
\t\`page\` integer,
\t\`chapter\` text,
\t\`color\` text DEFAULT '#f2ca50',
\t\`created_at\` text NOT NULL,
\tFOREIGN KEY (\`book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE \`notes\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`highlight_id\` text,
\t\`book_id\` text NOT NULL,
\t\`text\` text NOT NULL,
\t\`created_at\` text NOT NULL,
\tFOREIGN KEY (\`highlight_id\`) REFERENCES \`highlights\`(\`id\`) ON UPDATE no action ON DELETE no action,
\tFOREIGN KEY (\`book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE \`reading_progress\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`book_id\` text NOT NULL,
\t\`current_page\` integer NOT NULL,
\t\`percentage\` real NOT NULL,
\t\`locator\` text,
\t\`updated_at\` text NOT NULL,
\tFOREIGN KEY (\`book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE no action
);`
