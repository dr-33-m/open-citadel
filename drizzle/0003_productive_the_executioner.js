export default `CREATE TABLE \`bookmarks\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`book_id\` text NOT NULL,
	\`locator\` text NOT NULL,
	\`page\` integer,
	\`chapter\` text,
	\`created_at\` text NOT NULL,
	FOREIGN KEY (\`book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE \`thoughts\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`text\` text NOT NULL,
	\`color\` text DEFAULT '#f2ca50',
	\`tags\` text,
	\`created_at\` text NOT NULL
);`;
