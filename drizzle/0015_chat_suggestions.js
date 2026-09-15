export default `CREATE TABLE \`chat_suggestions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`session_id\` text NOT NULL,
	\`kind\` text NOT NULL,
	\`status\` text DEFAULT 'pending' NOT NULL,
	\`text\` text NOT NULL,
	\`tags\` text,
	\`book_id\` text,
	\`locator\` text,
	\`result_entry_id\` text,
	\`created_at\` text NOT NULL,
	FOREIGN KEY (\`session_id\`) REFERENCES \`chat_sessions\`(\`id\`) ON UPDATE no action ON DELETE cascade
);`;
